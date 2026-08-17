import { THEMES } from './themePresets';

/**
 * Automatically builds an edited montage plan from raw media and detected beats
 * - Assigns start/end timestamps
 * - Assigns Ken Burns pan/zoom paths for photos
 * - Determines transitions and color grading
 */
export function generateMontageTimeline(mediaList, audioDuration, beats = [], themeId = 'tiktok_beat') {
  if (!mediaList || mediaList.length === 0) return [];

  const theme = THEMES.find((t) => t.id === themeId) || THEMES[0];
  const [minCut, maxCut] = theme.targetCutDuration;

  // Filter beats within the audio total duration
  const validBeats = beats.filter((b) => b < audioDuration);

  // Group beats to form segment intervals matching theme's min/max duration
  const cutPoints = [0];
  let lastCut = 0;

  if (validBeats.length > 0) {
    for (const beat of validBeats) {
      const durationSinceLast = beat - lastCut;
      if (durationSinceLast >= minCut) {
        cutPoints.push(beat);
        lastCut = beat;
      }
    }
  }

  // If there's remaining time or not enough beats, fill regularly
  while (lastCut + minCut < audioDuration) {
    const nextCut = Math.min(lastCut + (minCut + maxCut) / 2, audioDuration);
    cutPoints.push(nextCut);
    lastCut = nextCut;
  }
  if (cutPoints[cutPoints.length - 1] < audioDuration) {
    cutPoints.push(audioDuration);
  }

  const clips = [];
  const kenBurnsTypes = ['zoom_in', 'zoom_out', 'pan_left', 'pan_right', 'dynamic_tilt'];

  for (let i = 0; i < cutPoints.length - 1; i++) {
    const startTime = cutPoints[i];
    const endTime = cutPoints[i + 1];
    const duration = endTime - startTime;

    if (duration <= 0.1) continue;

    // Pick media cyclically or with intelligent distribution
    const media = mediaList[i % mediaList.length];
    const motionType = kenBurnsTypes[i % kenBurnsTypes.length];

    // For videos, pick an offset window inside the video
    let videoOffset = 0;
    if (media.type === 'video' && media.videoDuration) {
      const maxOffset = Math.max(0, media.videoDuration - duration);
      // Pick a lively section
      videoOffset = (i * 1.5) % Math.max(1, maxOffset);
    }

    clips.push({
      id: `clip_${i}_${media.id}`,
      mediaId: media.id,
      mediaType: media.type,
      url: media.url,
      element: media.element,
      startTime,
      endTime,
      duration,
      videoOffset,
      motionType,
      transition: theme.transitionType,
      colorFilter: theme.colorFilter,
    });
  }

  return clips;
}
