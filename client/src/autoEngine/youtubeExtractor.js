/**
 * YouTube Audio Extraction Helper
 * Sends start/end timestamps to the backend so yt-dlp trims server-side.
 * The returned buffer already starts at t=0 and contains ONLY the requested slice.
 */

export async function fetchYouTubeAudioStream({ url, startTimeSec = 0, endTimeSec = 0, backendUrl = 'http://localhost:3001' }) {
  // Build backend URL with start + end seconds so yt-dlp trims server-side
  const params = new URLSearchParams({ url });
  if (startTimeSec > 0 || endTimeSec > startTimeSec) {
    params.set('start', Math.floor(startTimeSec));
    params.set('end',   Math.ceil(endTimeSec));
  }

  const proxyUrl = `${backendUrl}/api/youtube-audio?${params.toString()}`;
  console.log(`[YT] Fetching trimmed audio: ${proxyUrl}`);

  const res = await fetch(proxyUrl);

  if (!res.ok) {
    let errMsg = `Server responded ${res.status}`;
    try { const j = await res.json(); errMsg = j.error || errMsg; } catch (_) {}
    throw new Error(errMsg);
  }

  const buffer = await res.arrayBuffer();

  if (!buffer || buffer.byteLength < 1000) {
    throw new Error('Backend returned empty audio data. Check the backend console for yt-dlp errors.');
  }

  const label = endTimeSec > startTimeSec
    ? `${formatSec(startTimeSec)} → ${formatSec(endTimeSec)}`
    : 'full track';

  return {
    buffer,
    source: 'backend_trimmed',
    name: `YouTube Audio (${label})`,
  };
}

function formatSec(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}
