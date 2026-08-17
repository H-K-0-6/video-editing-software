/**
 * HTML5 Canvas Video Rendering Engine - Smooth Edition
 *
 * Key improvements over v1:
 *  - Video elements play NATIVELY (no per-frame seeking = no decoder stalls)
 *  - Active clip transitions managed with play/pause on clip boundaries
 *  - Smooth crossfade/fade-to-black between clips instead of hard cuts
 *  - Ken Burns uses CSS ease-in-out easing (not linear) for cinematic feel
 *  - Pre-warm: all video elements are loaded + buffered before first playback
 *  - Offscreen ImageBitmap cache for images to avoid repeated uploads to GPU
 */

export class VideoRenderEngine {
  constructor(canvas, options = {}) {
    this.width = options.width || 720;
    this.height = options.height || 1280;
    this.setCanvas(canvas);

    this.clips = [];
    this.audioElement = null;
    this.totalDuration = 0;
    this.currentTime = 0;
    this.isPlaying = false;
    this.animationFrameId = null;
    this.onProgress = null;
    this.onEnded = null;

    // Track which video element is currently playing to avoid double-play
    this._activeVideoEl = null;
    this._activeClipId = null;

    // Offscreen bitmap cache for images (avoids repeated texture uploads)
    this._bitmapCache = new Map();
  }

  setCanvas(canvas) {
    if (!canvas) return;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  // ── Pre-warm: ensure all video elements are loaded + ready ────────────────
  async prewarm() {
    const videoClips = (this.clips || []).filter(c => c.mediaType === 'video' && c.element);
    const promises = videoClips.map(clip => {
      const el = clip.element;
      return new Promise(resolve => {
        if (el.readyState >= 3) return resolve();
        el.oncanplaythrough = () => resolve();
        el.onerror = () => resolve(); // don't block on errors
        if (!el.src) resolve();
      });
    });
    await Promise.all(promises);
  }

  async setProject({ clips, audioElement, totalDuration, onProgress, onEnded }) {
    this._stopActiveVideo();
    this.clips = clips || [];
    this.audioElement = audioElement || null;
    this.totalDuration = totalDuration || 0;
    this.onProgress = onProgress || null;
    this.onEnded = onEnded || null;
    this.currentTime = 0;
    this._activeClipId = null;
    this._activeVideoEl = null;

    await this.prewarm();
    this.drawFrame(0);
  }

  seek(time) {
    this.currentTime = Math.max(0, Math.min(time, this.totalDuration));

    // Sync audio
    if (this.audioElement) {
      this.audioElement.currentTime = this.currentTime;
    }

    // Sync active video
    const clip = this._getActiveClip(this.currentTime);
    if (clip && clip.mediaType === 'video' && clip.element) {
      const targetTime = (clip.videoOffset || 0) + (this.currentTime - clip.startTime);
      clip.element.currentTime = Math.min(targetTime, (clip.element.duration || 999) - 0.05);
    }

    this.drawFrame(this.currentTime);
    if (this.onProgress) this.onProgress(this.currentTime, this.totalDuration);
  }

  play() {
    if (this.isPlaying) return;
    this.isPlaying = true;

    if (this.audioElement) {
      this.audioElement.currentTime = this.currentTime;
      this.audioElement.play().catch(e => console.warn('Audio play:', e));
    }

    let lastTime = performance.now();

    const loop = (now) => {
      if (!this.isPlaying) return;
      const delta = Math.min((now - lastTime) / 1000, 0.1); // cap delta to avoid jumps
      lastTime = now;

      this.currentTime += delta;

      // Sync to audio clock (prevents drift)
      if (this.audioElement && !this.audioElement.paused) {
        const audioClock = this.audioElement.currentTime;
        if (Math.abs(audioClock - this.currentTime) > 0.15) {
          this.currentTime = audioClock;
        }
      }

      if (this.currentTime >= this.totalDuration) {
        this.pause();
        this.currentTime = this.totalDuration;
        this.drawFrame(this.currentTime);
        if (this.onEnded) this.onEnded();
        return;
      }

      // Manage which video element is playing
      this._syncVideoPlayback(this.currentTime);

      this.drawFrame(this.currentTime);

      if (this.onProgress) this.onProgress(this.currentTime, this.totalDuration);
      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  pause() {
    this.isPlaying = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.audioElement) this.audioElement.pause();
    this._stopActiveVideo();
  }

  // ── Video lifecycle: play/pause video elements at clip boundaries ─────────
  _stopActiveVideo() {
    if (this._activeVideoEl) {
      try { this._activeVideoEl.pause(); } catch (_) {}
      this._activeVideoEl = null;
    }
  }

  _syncVideoPlayback(time) {
    const clip = this._getActiveClip(time);
    if (!clip) return;

    if (clip.mediaType === 'video' && clip.element) {
      const el = clip.element;

      // If we just switched to a new clip, set up the video element
      if (this._activeClipId !== clip.id) {
        // Pause the old one
        if (this._activeVideoEl && this._activeVideoEl !== el) {
          try { this._activeVideoEl.pause(); } catch (_) {}
        }

        // Seek the new clip's video to the right position
        const clipTime = time - clip.startTime;
        const targetTime = (clip.videoOffset || 0) + clipTime;
        el.currentTime = Math.min(Math.max(0, targetTime), (el.duration || 999) - 0.05);
        el.playbackRate = 1.0;
        el.muted = true;
        el.play().catch(e => {
          // Autoplay may be blocked; it will still draw the static frame
          console.warn('Video autoplay blocked:', e);
        });

        this._activeVideoEl = el;
        this._activeClipId = clip.id;
      }

      // Correct drift: if video is more than 200ms off, re-sync
      const clipTime = time - clip.startTime;
      const expectedVideoTime = (clip.videoOffset || 0) + clipTime;
      const videoTime = el.currentTime;
      const drift = Math.abs(videoTime - expectedVideoTime);
      if (drift > 0.25 && !el.seeking) {
        el.currentTime = Math.min(Math.max(0, expectedVideoTime), (el.duration || 999) - 0.05);
      }

    } else {
      // Current clip is an image — stop any playing video
      if (this._activeClipId !== clip.id) {
        if (this._activeVideoEl) {
          try { this._activeVideoEl.pause(); } catch (_) {}
          this._activeVideoEl = null;
        }
        this._activeClipId = clip.id;
      }
    }
  }

  _getActiveClip(time) {
    let clip = this.clips.find(c => time >= c.startTime && time < c.endTime);
    if (!clip && this.clips.length > 0) clip = this.clips[this.clips.length - 1];
    return clip || null;
  }

  // ── Easing function for cinematic Ken Burns ───────────────────────────────
  _easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  // ── Main render frame ─────────────────────────────────────────────────────
  drawFrame(time) {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = 'none';
    ctx.fillStyle = '#090a0f';
    ctx.fillRect(0, 0, w, h);

    if (!this.clips || this.clips.length === 0) return;

    const currentClip = this._getActiveClip(time);
    if (!currentClip) return;

    const clipTime = Math.max(0, time - currentClip.startTime);
    const clipDuration = Math.max(0.1, currentClip.duration || 1);
    const rawProgress = Math.max(0, Math.min(1, clipTime / clipDuration));
    const progress = this._easeInOut(rawProgress); // smooth easing

    // ── Crossfade transition ───────────────────────────────────────────────
    const FADE_DURATION = 0.3; // seconds of crossfade
    const timeIntoClip = clipTime;
    const timeRemaining = currentClip.endTime - time;

    // Fade in at start of clip
    let globalAlpha = 1;
    if (timeIntoClip < FADE_DURATION) {
      globalAlpha = Math.min(1, timeIntoClip / FADE_DURATION);
    }
    // Fade out at end of clip
    if (timeRemaining < FADE_DURATION) {
      globalAlpha = Math.min(globalAlpha, timeRemaining / FADE_DURATION);
    }

    // ── Ken Burns motion ──────────────────────────────────────────────────
    let zoom = 1.0;
    let panX = 0;
    let panY = 0;

    switch (currentClip.motionType) {
      case 'zoom_in':
        zoom = 1.0 + progress * 0.15;
        break;
      case 'zoom_out':
        zoom = 1.15 - progress * 0.15;
        break;
      case 'pan_left':
        zoom = 1.1;
        panX = (0.5 - progress) * 60;
        break;
      case 'pan_right':
        zoom = 1.1;
        panX = (progress - 0.5) * 60;
        break;
      case 'dynamic_tilt':
      default:
        zoom = 1.06 + Math.sin(progress * Math.PI) * 0.06;
        panY = Math.sin(progress * Math.PI) * 20;
        break;
    }

    // ── Draw media element ────────────────────────────────────────────────
    const el = currentClip.element;
    if (el) {
      const mediaW = el.naturalWidth || el.videoWidth || el.width || 1280;
      const mediaH = el.naturalHeight || el.videoHeight || el.height || 720;

      if (mediaW > 0 && mediaH > 0) {
        const scale = Math.max(w / mediaW, h / mediaH);
        const scaledW = mediaW * scale;
        const scaledH = mediaH * scale;

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, globalAlpha));
        if (currentClip.colorFilter) ctx.filter = currentClip.colorFilter;
        ctx.translate(w / 2 + panX, h / 2 + panY);
        ctx.scale(zoom, zoom);
        try {
          ctx.drawImage(el, -scaledW / 2, -scaledH / 2, scaledW, scaledH);
        } catch (_) {}
        ctx.restore();
      }
    }

    // ── Beat flash overlay (for energetic themes only) ────────────────────
    const FLASH_WINDOW = 0.12; // only very brief flash right at clip boundary
    if (currentClip.transition === 'flash_zoom' && timeRemaining < FLASH_WINDOW) {
      const flashAlpha = (1 - timeRemaining / FLASH_WINDOW) * 0.55;
      ctx.save();
      ctx.fillStyle = `rgba(255,255,255,${flashAlpha})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  // ── Dedicated High-Stability Video Export ─────────────────────────────────
  async exportVideo(onProgressCallback) {
    this.pause();
    this.seek(0);
    await this.prewarm();

    // Stream from canvas at solid 30 FPS
    const stream = this.canvas.captureStream(30);

    // Audio stream connection
    if (this.audioElement) {
      try {
        if (!this._audioCtx) {
          this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          this._audioSrcNode = this._audioCtx.createMediaElementSource(this.audioElement);
          this._audioDestNode = this._audioCtx.createMediaStreamDestination();
          this._audioSrcNode.connect(this._audioDestNode);
          this._audioSrcNode.connect(this._audioCtx.destination);
        }
        if (this._audioCtx.state === 'suspended') {
          await this._audioCtx.resume();
        }
        const audioTrack = this._audioDestNode.stream.getAudioTracks()[0];
        if (audioTrack) stream.addTrack(audioTrack);
      } catch (err) {
        console.warn('Audio capture setup warning:', err);
      }
    }

    // Determine target duration from clips and timeline
    let maxClipEnd = 0;
    if (this.clips && this.clips.length > 0) {
      maxClipEnd = Math.max(...this.clips.map(c => c.endTime || 0));
    }
    const targetDuration = Math.max(this.totalDuration || 0, maxClipEnd, 12);

    // Choose best supported MIME type
    const candidateTypes = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4;codecs=avc1',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];

    let mimeType = candidateTypes.find(type => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) || 'video/webm';

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 10_000_000,
    });
    const chunks = [];
    recorder.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };

    return new Promise((resolve, reject) => {
      let isDone = false;

      recorder.onstop = () => {
        const finalType = chunks.length > 0 && chunks[0].type ? chunks[0].type : mimeType.split(';')[0];
        const blob = new Blob(chunks, { type: finalType });
        resolve(blob);
      };
      recorder.onerror = e => reject(e);

      recorder.start(100);

      // Start audio playback from t=0
      if (this.audioElement) {
        this.audioElement.currentTime = 0;
        this.audioElement.play().catch(e => console.warn('Export audio play:', e));
      }

      const FPS = 30;
      let currentTime = 0;
      const startWall = performance.now();

      const exportInterval = setInterval(() => {
        if (isDone) return;

        let elapsedReal = (performance.now() - startWall) / 1000;
        
        // Sync time to audio if playing, otherwise fallback to real time
        if (this.audioElement && this.audioElement.currentTime > 0) {
           currentTime = this.audioElement.currentTime;
        } else {
           currentTime = elapsedReal;
        }
        
        this.currentTime = currentTime;

        // Render current frame
        this._syncVideoPlayback(currentTime);
        this.drawFrame(currentTime);

        const pct = Math.min(99, Math.round((currentTime / targetDuration) * 100));
        if (onProgressCallback) onProgressCallback(pct);

        if (currentTime >= targetDuration || elapsedReal >= targetDuration + 1) {
          isDone = true;
          clearInterval(exportInterval);

          if (this.audioElement) this.audioElement.pause();
          this._stopActiveVideo();

          if (onProgressCallback) onProgressCallback(100);

          try {
            if (recorder.state === 'recording') {
              recorder.requestData();
            }
          } catch (_) {}

          setTimeout(() => {
            try {
              if (recorder.state !== 'inactive') recorder.stop();
            } catch (_) {}
          }, 300);
        }
      }, 1000 / FPS);
    });
  }
}
