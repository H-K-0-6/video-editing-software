import express from 'express';
import cors from 'cors';
import { spawn, execSync, execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// ── Locate yt-dlp binary ──────────────────────────────────────────────────────
function findYtDlp() {
  const candidates = [
    path.join(__dirname, 'bin', 'yt-dlp.exe'),  // bundled alongside server
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
    path.join(binDir, 'ffmpeg.exe'),           // bundled in server/bin/
    path.join(binDir, 'ffmpeg', 'bin', 'ffmpeg.exe'),
    'ffmpeg',
    'ffmpeg.exe',
  ];
  for (const c of candidates) {
    try {
      // Use execFileSync (no shell) so paths with spaces work reliably
      execFileSync(c, ['-version'], { stdio: 'ignore' });
      return c;
    } catch (_) {}
  }
  return null;
}

const FFMPEG = findFfmpeg();

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    ytdlp:  YTDLP  ? `found: ${YTDLP}`  : 'NOT FOUND',
    ffmpeg: FFMPEG ? `found: ${FFMPEG}` : 'NOT FOUND - timestamp trimming will fail',
  });
});

// ── Helper: run yt-dlp with optional cookie strategies ────────────────────────
function ytdlpStream(url, extraArgs) {
  // Strategy A: with Chrome cookies (best for logged-in accounts)
  // Strategy B: without cookies (works for many videos without login)
  const cookieStrategies = [
    ['--cookies-from-browser', 'chrome'],
    ['--cookies-from-browser', 'firefox'],
    [],  // no cookies fallback
  ];

  // We'll try strategies sequentially but for streaming we just pick the first
  // that launches without an immediate error; yt-dlp handles retries internally.
  // For simplicity, attempt chrome first, fall back to no-cookies if it fails.
  return (cookieArgs) => {
    const args = [
      '--no-playlist',
      ...cookieArgs,
      '--extractor-arg', 'youtube:player_client=android,web',
      ...extraArgs,
      url,
    ];
    return { proc: spawn(YTDLP, args, { stdio: ['ignore', 'pipe', 'pipe'] }), args };
  };
}

// ── Helper: convert seconds → HH:MM:SS for yt-dlp --download-sections ─────
function secToTimestamp(sec) {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

// ── YouTube audio stream (main endpoint) ─────────────────────────────────────
// Query params: url, start (seconds, optional), end (seconds, optional)
app.get('/api/youtube-audio', (req, res) => {
  const { url, start, end } = req.query;
  if (!url) return res.status(400).json({ error: 'URL required' });

  if (!YTDLP) {
    console.error('yt-dlp not found!');
    return res.status(503).json({
      error: 'yt-dlp not installed. server/bin/yt-dlp.exe is missing.',
    });
  }

  const startSec = parseFloat(start) || 0;
  const endSec   = parseFloat(end)   || 0;
  const hasRange = endSec > startSec;

  // Build yt-dlp args
  const ffmpegArgs = FFMPEG ? ['--ffmpeg-location', path.dirname(FFMPEG)] : [];

  const sectionArgs = hasRange
    ? [
        '--download-sections', `*${secToTimestamp(startSec)}-${secToTimestamp(endSec)}`,
        '--force-keyframes-at-cuts',
      ]
    : [];

  const baseArgs = [
    '-f', 'bestaudio/best',
    '--downloader', 'ffmpeg',                    // ALWAYS use ffmpeg for streaming
    '--downloader-args', 'ffmpeg:-vn -f mp3',    // ALWAYS force mp3 output (drops video)
    ...ffmpegArgs,
    ...sectionArgs,
    '--no-playlist',
    '--extractor-arg', 'youtube:player_client=android,web',
    '-o', '-',
  ];

  if (hasRange) {
    if (!FFMPEG) console.warn('[yt-dlp] WARNING: ffmpeg not found — trimming will fail!');
    console.log(`[yt-dlp] Trimming ${secToTimestamp(startSec)} → ${secToTimestamp(endSec)} | ${url}`);
  } else {
    console.log(`[yt-dlp] Full audio | ${url}`);
  }

  res.header('Access-Control-Allow-Origin', '*');
  res.header('Content-Type', 'audio/mpeg'); // always mp3

  const cookieStrategies = [
    ['--cookies-from-browser', 'chrome'],
    ['--cookies-from-browser', 'edge'],
    ['--cookies-from-browser', 'firefox'],
    [] // fallback to no cookies
  ];

  let started = false;

  function tryStream(strategyIndex) {
    if (strategyIndex >= cookieStrategies.length) {
      if (!res.headersSent) res.status(500).json({ error: 'All yt-dlp stream attempts failed.' });
      else if (!res.writableEnded) res.end();
      return;
    }

    const cookieArgs = cookieStrategies[strategyIndex];
    const args = [...cookieArgs, ...baseArgs, url];
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
      
      console.warn(`[yt-dlp] exited code=${code} for strategy: ${cookieArgs.length ? cookieArgs[1] : 'no-cookies'}`);
      
      if (!started) {
        console.log(`[yt-dlp] Retrying with next strategy...`);
        tryStream(strategyIndex + 1);
      } else {
        if (!res.headersSent) res.status(500).json({ error: `yt-dlp failed (code ${code}). See backend console.` });
        else if (!res.writableEnded) res.end();
      }
    });

    req.on('close', () => proc.kill());
  }

  // Start with strategy 0
  tryStream(0);
});

// ── YouTube video info ────────────────────────────────────────────────────────
app.get('/api/youtube-info', (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL required' });
  if (!YTDLP) return res.status(503).json({ error: 'yt-dlp not found' });

  const cookieStrategies = [
    ['--cookies-from-browser', 'chrome'],
    ['--cookies-from-browser', 'edge'],
    ['--cookies-from-browser', 'firefox'],
    [] // fallback
  ];

  function tryInfo(strategyIndex) {
    if (strategyIndex >= cookieStrategies.length) {
      return res.status(500).json({ error: 'Failed to fetch info across all attempts.' });
    }

    const args = [
      '--dump-json', '--no-playlist', '--no-download',
      ...cookieStrategies[strategyIndex],
      '--extractor-arg', 'youtube:player_client=android,web',
      '-q',
      url,
    ];

    let output = '';
    let stderr = '';
    const proc = spawn(YTDLP, args);
    proc.stdout.on('data', (d) => (output += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    
    proc.on('close', (code) => {
      if (code !== 0 || !output.trim()) {
        console.warn(`[yt-dlp info] failed strategy: ${cookieStrategies[strategyIndex][1] || 'none'} - ${stderr.split('\n')[0]}`);
        return tryInfo(strategyIndex + 1);
      }
      try {
        const json = JSON.parse(output);
        res.json({
          title: json.title,
          author: json.channel || json.uploader || 'Unknown',
          lengthSeconds: json.duration || 0,
          thumbnail: json.thumbnail || '',
        });
      } catch {
        res.status(500).json({ error: 'Failed to parse yt-dlp info' });
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
  else        console.error('❌ ffmpeg  NOT FOUND — timestamp trimming will fail. Place ffmpeg.exe in server/bin/');
  console.log(`🎬 Backend running on http://localhost:${PORT}`);
});
