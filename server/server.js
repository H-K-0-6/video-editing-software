import express from 'express';
import cors from 'cors';
import { spawn, execSync, execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── YouTube Cookies Setup ─────────────────────────────────────────────────────
let ytCookiesPath = null;
if (process.env.YOUTUBE_COOKIES) {
  try {
    ytCookiesPath = path.join(__dirname, 'youtube_cookies.txt');
    fs.writeFileSync(ytCookiesPath, process.env.YOUTUBE_COOKIES, 'utf8');
    console.log('[Setup] Saved YOUTUBE_COOKIES to', ytCookiesPath);
  } catch (err) {
    console.error('[Setup] Failed to write youtube cookies:', err);
  }
}

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// ── Locate yt-dlp binary ──────────────────────────────────────────────────────
function findYtDlp() {
  const candidates = [
    path.join(__dirname, 'bin', 'yt-dlp.exe'),
    path.join(__dirname, 'bin', 'yt-dlp'),
    'yt-dlp',
    'yt-dlp.exe',
  ];
  for (const c of candidates) {
    try { execSync(`"${c}" --version`, { stdio: 'ignore' }); return c; } catch (_) {}
  }
  return null;
}

const YTDLP = findYtDlp();

// ── Locate ffmpeg binary ──────────────────────────────────────────────────────
function findFfmpeg() {
  const binDir = path.join(__dirname, 'bin');
  const candidates = [
    path.join(binDir, 'ffmpeg.exe'),
    path.join(binDir, 'ffmpeg', 'bin', 'ffmpeg.exe'),
    'ffmpeg',
    'ffmpeg.exe',
  ];
  for (const c of candidates) {
    try {
      execFileSync(c, ['-version'], { stdio: 'ignore' });
      return c;
    } catch (_) {}
  }
  return null;
}

const FFMPEG = findFfmpeg();

// ── Helper: convert seconds → HH:MM:SS ────────────────────────────────────────
function secToTimestamp(sec) {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

// ── Helper: Clean & Normalize YouTube URL ────────────────────────────────────
function extractVideoId(rawUrl) {
  try {
    const u = new URL(rawUrl.trim());
    if (u.hostname.includes('youtu.be')) {
      return u.pathname.replace(/^\//, '').split('/')[0].split('?')[0];
    }
    if (u.searchParams.has('v')) {
      return u.searchParams.get('v');
    }
    if (u.pathname.includes('/shorts/')) {
      return u.pathname.split('/shorts/')[1].split('/')[0].split('?')[0];
    }
    if (u.pathname.includes('/embed/')) {
      return u.pathname.split('/embed/')[1].split('/')[0].split('?')[0];
    }
  } catch (_) {}
  const match = rawUrl.match(/(?:v=|\/embed\/|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

function normalizeYouTubeUrl(rawUrl) {
  const id = extractVideoId(rawUrl);
  if (id) return `https://www.youtube.com/watch?v=${id}`;
  return rawUrl.trim();
}

// ── Helper: Stream from direct audio URL with ffmpeg ──────────────────────────
function streamAudioFromUrlWithFfmpeg(streamUrl, startSec, endSec, res) {
  const ffmpegCmd = FFMPEG || 'ffmpeg';
  const ffmpegArgs = [];
  if (startSec > 0) ffmpegArgs.push('-ss', secToTimestamp(startSec));
  if (endSec > startSec) ffmpegArgs.push('-to', secToTimestamp(endSec));
  ffmpegArgs.push('-i', streamUrl, '-vn', '-c:a', 'libmp3lame', '-b:a', '192k', '-f', 'mp3', 'pipe:1');

  console.log(`[FFmpeg] Spawning stream decoder for: ${streamUrl.substring(0, 60)}...`);
  const ffProc = spawn(ffmpegCmd, ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

  let gotData = false;
  ffProc.stdout.on('data', (chunk) => {
    gotData = true;
    if (!res.headersSent) {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Content-Type', 'audio/mpeg');
    }
    res.write(chunk);
  });

  ffProc.stderr.on('data', (d) => {
    // console.log('[ffmpeg]', d.toString());
  });

  ffProc.on('close', (code) => {
    if (code === 0 || gotData) {
      if (!res.writableEnded) res.end();
    } else if (!res.headersSent) {
      res.status(500).json({ error: 'FFmpeg stream decoding failed.' });
    }
  });

  return true;
}

// ── Helper: Multi-Provider Fallback Streamer (Piped, Cobalt, Invidious) ────────
async function streamViaMultiProviderFallback(videoId, startSec, endSec, res) {
  // Provider 1: Piped API instances
  const pipedInstances = [
    'https://pipedapi.kavin.rocks',
    'https://api.piped.privacy.com.de',
    'https://pipedapi.tokhmi.xyz',
    'https://pipedapi.adminforge.de',
    'https://piped-api.lunar.icu',
  ];

  for (const instance of pipedInstances) {
    try {
      console.log(`[Fallback: Piped] Trying ${instance}/streams/${videoId}...`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const resp = await fetch(`${instance}/streams/${videoId}`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      clearTimeout(timeout);

      if (!resp.ok) continue;
      const data = await resp.json();
      const audioStreams = data.audioStreams || [];
      if (!audioStreams.length) continue;

      const selected = audioStreams.find((s) => s.itag === 140 || s.itag === '140') || audioStreams[0];
      if (selected && selected.url) {
        console.log(`[Fallback: Piped] Success! Slicing audio stream with FFmpeg...`);
        return streamAudioFromUrlWithFfmpeg(selected.url, startSec, endSec, res);
      }
    } catch (err) {
      console.warn(`[Fallback: Piped] ${instance} failed:`, err.message);
    }
  }

  // Provider 2: Cobalt API instances
  const cobaltInstances = [
    'https://cobalt-api.kwiatekm.pl',
    'https://api.cobalt.tools',
  ];

  for (const instance of cobaltInstances) {
    try {
      console.log(`[Fallback: Cobalt] Trying ${instance}...`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(instance, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0',
        },
        body: JSON.stringify({
          url: `https://www.youtube.com/watch?v=${videoId}`,
          downloadMode: 'audio',
          audioFormat: 'mp3',
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!resp.ok) continue;
      const data = await resp.json();
      if (data && (data.url || data.audio)) {
        const streamUrl = data.url || data.audio;
        console.log(`[Fallback: Cobalt] Success! Slicing audio stream with FFmpeg...`);
        return streamAudioFromUrlWithFfmpeg(streamUrl, startSec, endSec, res);
      }
    } catch (err) {
      console.warn(`[Fallback: Cobalt] ${instance} failed:`, err.message);
    }
  }

  // Provider 3: Invidious instances
  const invidiousInstances = [
    'https://invidious.nerdvpn.de',
    'https://inv.tux.pizza',
    'https://invidious.private.coffee',
    'https://yt.drgnz.club',
  ];

  for (const instance of invidiousInstances) {
    try {
      console.log(`[Fallback: Invidious] Trying ${instance} for ${videoId}...`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const resp = await fetch(`${instance}/api/v1/videos/${videoId}`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      clearTimeout(timeout);

      if (!resp.ok) continue;
      const data = await resp.json();
      const audioStreams = (data.adaptiveFormats || []).filter(
        (f) => f.type && f.type.startsWith('audio')
      );
      if (!audioStreams.length) continue;

      const selected =
        audioStreams.find((f) => f.itag === 140 || f.itag === '140' || f.itag === 251 || f.itag === '251') ||
        audioStreams[0];

      const streamUrl = selected.url || `${instance}/latest_version?id=${videoId}&itag=${selected.itag}&local=true`;
      console.log(`[Fallback: Invidious] Success! Slicing audio stream with FFmpeg...`);
      return streamAudioFromUrlWithFfmpeg(streamUrl, startSec, endSec, res);
    } catch (err) {
      console.warn(`[Fallback: Invidious] ${instance} failed:`, err.message);
    }
  }

  return false;
}

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    ytdlp:  YTDLP  ? `found: ${YTDLP}`  : 'NOT FOUND',
    ffmpeg: FFMPEG ? `found: ${FFMPEG}` : 'NOT FOUND - timestamp trimming will fail',
    cookiesLoaded: !!ytCookiesPath,
  });
});

// ── YouTube audio stream (main endpoint) ─────────────────────────────────────
app.get('/api/youtube-audio', async (req, res) => {
  const { url, start, end } = req.query;
  if (!url) return res.status(400).json({ error: 'URL required' });

  const cleanUrl = normalizeYouTubeUrl(url);
  const videoId = extractVideoId(url);
  const startSec = parseFloat(start) || 0;
  const endSec   = parseFloat(end)   || 0;
  const hasRange = endSec > startSec;

  const ffmpegArgs = (FFMPEG && path.dirname(FFMPEG) !== '.') ? ['--ffmpeg-location', path.dirname(FFMPEG)] : [];

  const sectionArgs = hasRange
    ? [
        '--download-sections', `*${secToTimestamp(startSec)}-${secToTimestamp(endSec)}`,
        '--force-keyframes-at-cuts',
      ]
    : [];

  const baseArgs = [
    '-f', 'bestaudio/best',
    '--downloader', 'ffmpeg',
    '--downloader-args', 'ffmpeg:-vn -f mp3',
    '--force-ipv4',
    '--no-playlist',
    ...ffmpegArgs,
    ...sectionArgs,
    '-o', '-',
  ];

  if (hasRange) {
    console.log(`[yt-dlp] Trimming ${secToTimestamp(startSec)} → ${secToTimestamp(endSec)} | ${cleanUrl}`);
  } else {
    console.log(`[yt-dlp] Full audio | ${cleanUrl}`);
  }

  res.header('Access-Control-Allow-Origin', '*');
  res.header('Content-Type', 'audio/mpeg');

  // Build strategies based on environment
  const strategies = [];
  if (ytCookiesPath) {
    strategies.push(['--cookies', ytCookiesPath]);
  }
  if (process.platform === 'win32') {
    strategies.push(['--cookies-from-browser', 'chrome']);
    strategies.push(['--cookies-from-browser', 'edge']);
    strategies.push(['--cookies-from-browser', 'firefox']);
  }
  // Client rotation strategies for datacenter IP resilience
  strategies.push(['--extractor-args', 'youtube:player_client=android_vr,mweb']);
  strategies.push(['--extractor-args', 'youtube:player_client=web_creator,mweb']);
  strategies.push([]); // Default

  let started = false;

  async function tryStream(strategyIndex, lastError = '') {
    if (strategyIndex >= strategies.length) {
      console.log('[yt-dlp] All native strategies failed. Attempting resilient stream fallback...');
      if (videoId) {
        const fallbackSuccess = await streamViaMultiProviderFallback(videoId, startSec, endSec, res);
        if (fallbackSuccess) return;
      }

      if (!res.headersSent) {
        res.status(500).json({ error: `Audio extraction failed. Server error: ${lastError}` });
      } else if (!res.writableEnded) {
        res.end();
      }
      return;
    }

    const stratArgs = strategies[strategyIndex];
    const args = [...stratArgs, ...baseArgs, cleanUrl];
    const proc = spawn(YTDLP, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let hadData = false;
    let stderr  = '';

    proc.stdout.on('data', (chunk) => {
      hadData = true;
      started = true;
      res.write(chunk);
    });

    proc.stderr.on('data', (d) => {
      const msg = d.toString();
      stderr += msg;
      if (!msg.includes('[download]') || msg.includes('Destination')) {
        console.log('[yt-dlp]', msg.trim());
      }
    });

    proc.on('close', (code) => {
      if (code === 0 || hadData) {
        if (!res.writableEnded) res.end();
        return;
      }

      console.warn(`[yt-dlp] Strategy ${strategyIndex} exited code=${code}`);

      if (!started) {
        tryStream(strategyIndex + 1, stderr.trim());
      } else {
        if (!res.headersSent) res.status(500).json({ error: `yt-dlp failed (code ${code}). Error: ${stderr.trim()}` });
        else if (!res.writableEnded) res.end();
      }
    });

    req.on('close', () => proc.kill());
  }

  tryStream(0);
});

// ── YouTube video info ────────────────────────────────────────────────────────
app.get('/api/youtube-info', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL required' });

  const cleanUrl = normalizeYouTubeUrl(url);
  const videoId = extractVideoId(url);

  // Fast oEmbed fallback helper (works 100% of the time, zero bot checks)
  async function fetchOEmbedInfo() {
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(cleanUrl)}&format=json`;
      const oembedResp = await fetch(oembedUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (oembedResp.ok) {
        const oembedData = await oembedResp.json();
        return {
          title: oembedData.title || 'YouTube Audio',
          author: oembedData.author_name || 'YouTube Creator',
          lengthSeconds: 0,
          thumbnail: oembedData.thumbnail_url || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ''),
        };
      }
    } catch (_) {}
    return null;
  }

  if (!YTDLP) {
    const info = await fetchOEmbedInfo();
    if (info) return res.json(info);
    return res.status(503).json({ error: 'yt-dlp not found' });
  }

  const strategies = [];
  if (ytCookiesPath) strategies.push(['--cookies', ytCookiesPath]);
  strategies.push(['--extractor-args', 'youtube:player_client=android_vr,mweb']);
  strategies.push([]);

  function tryInfo(strategyIndex, lastError = '') {
    if (strategyIndex >= strategies.length) {
      // Fall back to oEmbed
      fetchOEmbedInfo().then((info) => {
        if (info) return res.json(info);
        res.status(500).json({ error: `Failed to fetch info. Last error: ${lastError}` });
      });
      return;
    }

    const args = [
      '--dump-json', '--no-playlist', '--no-download', '--force-ipv4',
      ...strategies[strategyIndex],
      '-q',
      cleanUrl,
    ];

    let output = '';
    let stderr = '';
    const proc = spawn(YTDLP, args);
    proc.stdout.on('data', (d) => (output += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));

    proc.on('close', (code) => {
      if (code !== 0 || !output.trim()) {
        return tryInfo(strategyIndex + 1, stderr.trim());
      }
      try {
        const json = JSON.parse(output);
        res.json({
          title: json.title,
          author: json.channel || json.uploader || 'Unknown',
          lengthSeconds: json.duration || 0,
          thumbnail: json.thumbnail || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ''),
        });
      } catch {
        fetchOEmbedInfo().then((info) => {
          if (info) return res.json(info);
          res.status(500).json({ error: 'Failed to parse yt-dlp info' });
        });
      }
    });
  }

  tryInfo(0);
});

// Serve static files from the React frontend app
app.use(express.static(path.join(__dirname, '../client/dist')));

// Catch-all route to serve index.html for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

app.listen(PORT, () => {
  if (YTDLP)  console.log(`✅ yt-dlp  found: ${YTDLP}`);
  else        console.error('❌ yt-dlp  NOT FOUND — place yt-dlp.exe in server/bin/');
  if (FFMPEG) console.log(`✅ ffmpeg  found: ${FFMPEG}`);
  else        console.error('❌ ffmpeg  NOT FOUND — timestamp trimming will fail.');
  console.log(`🎬 Backend running on http://localhost:${PORT}`);
});
