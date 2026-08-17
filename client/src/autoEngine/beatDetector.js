/**
 * Audio Beat & Energy Transient Detection using Web Audio API OfflineAudioContext
 */

export async function analyzeAudioBeats(audioBuffer) {
  try {
    const rawData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const duration = audioBuffer.duration;

    // Split audio into small analysis windows (e.g. 50ms frames)
    const windowSize = Math.floor(sampleRate * 0.05); // 50ms
    const hopSize = Math.floor(sampleRate * 0.025);   // 25ms
    const numFrames = Math.floor((rawData.length - windowSize) / hopSize);

    if (numFrames <= 0) {
      return fallbackBeats(duration);
    }

    const energies = new Float32Array(numFrames);
    for (let i = 0; i < numFrames; i++) {
      let sum = 0;
      const start = i * hopSize;
      for (let j = 0; j < windowSize; j++) {
        const val = rawData[start + j];
        sum += val * val;
      }
      energies[i] = Math.sqrt(sum / windowSize);
    }

    // Local average energy to detect sharp peaks / onsets
    const peaks = [];
    const localRadius = 10; // ~250ms lookaround
    const thresholdFactor = 1.35;

    for (let i = localRadius; i < numFrames - localRadius; i++) {
      let localSum = 0;
      for (let j = i - localRadius; j <= i + localRadius; j++) {
        localSum += energies[j];
      }
      const localAvg = localSum / (localRadius * 2 + 1);

      if (
        energies[i] > localAvg * thresholdFactor &&
        energies[i] > energies[i - 1] &&
        energies[i] > energies[i + 1] &&
        energies[i] > 0.05 // ignore absolute silence
      ) {
        const timeInSeconds = (i * hopSize) / sampleRate;
        // Avoid clustering peaks too close (< 0.35 seconds apart for good pacing)
        if (peaks.length === 0 || timeInSeconds - peaks[peaks.length - 1] > 0.4) {
          peaks.push(parseFloat(timeInSeconds.toFixed(3)));
        }
      }
    }

    if (peaks.length < 3) {
      return fallbackBeats(duration);
    }

    return peaks;
  } catch (err) {
    console.warn('Audio beat detection fallback triggered:', err);
    return fallbackBeats(audioBuffer ? audioBuffer.duration : 15);
  }
}

function fallbackBeats(duration, interval = 1.8) {
  const beats = [];
  let current = 0;
  while (current < duration) {
    beats.push(parseFloat(current.toFixed(2)));
    current += interval;
  }
  return beats;
}
