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
  const ffmpegArgs = [
    '-headers', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36\r\n',
  ];
  if (startSec > 0) ffmpegArgs.push('-ss', secToTimestamp(startSec));
  if (endSec > startSec) ffmpegArgs.push('-to', secToTimestamp(endSec));
  ffmpegArgs.push('-i', streamUrl, '-vn', '-c:a', 'libmp3lame', '-b:a', '192k', '-f', 'mp3', 'pipe:1');

  console.log(`[FFmpeg] Spawning stream decoder for audio URL...`);
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

// ── Helper: Parallel Multi-Provider Audio Resolver (Fast <1s Response) ────────
async function resolveAudioStreamUrlParallel(videoId) {
  const resolvers = [];

  // Piped endpoints
  const pipedHosts = [
    'https://pipedapi.kavin.rocks',
    'https://api.piped.privacydev.net',
    'https://piped-api.lunar.icu',
    'https://pipedapi.ducks.party',
    'https://pipedapi.smnz.de',
    'https://pipedapi.r4fo.com',
    'https://pipedapi.leptons.xyz',
    'https://api.piped.projectsegfau.lt',
    'https://pipedapi.drgns.space',
    'https://piped-api.garudalinux.org',
  ];

  for (const host of pipedHosts) {
    resolvers.push(
      (async () => {
        const c = new AbortController();
        const t = setTimeout(() => c.abort(), 6000);
        try {
          const r = await fetch(`${host}/streams/${videoId}`, {
            signal: c.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/json',
            },
          });
          clearTimeout(t);
          if (!r.ok) throw new Error(`${host} status ${r.status}`);
          const j = await r.json();
          const streams = j.audioStreams || [];
          const s = streams.find((x) => x.itag === 140 || x.itag === '140') || streams[0];
          if (s && s.url) return s.url;
          throw new Error('No stream');
        } finally {
          clearTimeout(t);
        }
      })()
    );
  }

  // Invidious endpoints
  const invidiousHosts = [
    'https://invidious.nerdvpn.de',
    'https://inv.tux.pizza',
    'https://invidious.private.coffee',
    'https://yt.drgnz.club',
    'https://invidious.projectsegfau.lt',
    'https://invidious.drgns.space',
    'https://iv.melmac.space',
  ];

  for (const host of invidiousHosts) {
    resolvers.push(
      (async () => {
        const c = new AbortController();
        const t = setTimeout(() => c.abort(), 6000);
        try {
          const r = await fetch(`${host}/api/v1/videos/${videoId}`, {
            signal: c.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/json',
            },
          });
          clearTimeout(t);
          if (!r.ok) throw new Error(`${host} status ${r.status}`);
          const j = await r.json();
          const streams = (j.adaptiveFormats || []).filter((f) => f.type && f.type.startsWith('audio'));
          const s = streams.find((f) => f.itag === 140 || f.itag === '140' || f.itag === 251) || streams[0];
          if (s) return s.url || `${host}/latest_version?id=${videoId}&itag=${s.itag}&local=true`;
          throw new Error('No stream');
        } finally {
          clearTimeout(t);
        }
      })()
    );
  }

  // Additional direct media resolver
  resolvers.push(
    (async () => {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 6000);
      try {
        const r = await fetch(`https://api.vkrdown.com/api/get?url=https://www.youtube.com/watch?v=${videoId}`, {
          signal: c.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
          },
        });
        clearTimeout(t);
        if (!r.ok) throw new Error('vkrdown failed');
        const j = await r.json();
        const streamUrl = j?.data?.downloadUrl || j?.data?.streamUrl || j?.downloadUrl;
        if (streamUrl) return streamUrl;
        throw new Error('No vkrdown url');
      } finally {
        clearTimeout(t);
      }
    })()
  );

  try {
    const fastestUrl = await Promise.any(resolvers);
    console.log('[Fast Resolver] Found valid audio stream URL in parallel!');
    return fastestUrl;
  } catch (err) {
    console.warn('[Fast Resolver] All parallel providers failed:', err.message);
    return null;
  }
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

  if (hasRange) {
    console.log(`[Audio Request] Trimming ${secToTimestamp(startSec)} → ${secToTimestamp(endSec)} | ${cleanUrl}`);
  } else {
    console.log(`[Audio Request] Full audio | ${cleanUrl}`);
  }

  // 1. FAST PATH: If videoId is present and no cookies were manually loaded on server,
  // query our high-speed decentralized resolver network first!
  if (videoId && !ytCookiesPath) {
    try {
      console.log(`[Fast Path] Querying parallel audio providers for ${videoId}...`);
      const streamUrl = await resolveAudioStreamUrlParallel(videoId);
      if (streamUrl) {
        return streamAudioFromUrlWithFfmpeg(streamUrl, startSec, endSec, res);
      }
    } catch (err) {
      console.warn('[Fast Path] Parallel resolution error:', err);
    }
  }

  // 2. yt-dlp path (with cookies or fallback)
  if (!YTDLP) {
    return res.status(503).json({ error: 'Audio processor not ready on server.' });
  }

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

  const strategies = [];
  if (ytCookiesPath) {
    strategies.push(['--cookies', ytCookiesPath]);
  }
  strategies.push(['--extractor-args', 'youtube:player_client=android_vr,mweb']);
  strategies.push([]);

  let started = false;

  async function tryStream(strategyIndex, lastError = '') {
    if (strategyIndex >= strategies.length) {
      // Last chance: Try parallel resolver if not tried yet
      if (videoId) {
        const streamUrl = await resolveAudioStreamUrlParallel(videoId);
        if (streamUrl) {
          return streamAudioFromUrlWithFfmpeg(streamUrl, startSec, endSec, res);
        }
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
      if (!res.headersSent) {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Content-Type', 'audio/mpeg');
      }
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

  const info = await fetchOEmbedInfo();
  if (info) return res.json(info);

  res.status(500).json({ error: 'Could not fetch YouTube info' });
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
