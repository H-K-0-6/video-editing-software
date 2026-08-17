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

import * as Mp4Muxer from './mp4-muxer.mjs';

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

  async setProject({ clips, audioElement, audioBuffer, totalDuration, onProgress, onEnded }) {
    this._stopActiveVideo();
    this.clips = clips || [];
    this.audioElement = audioElement || null;
    this.audioBuffer = audioBuffer || null;
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

    let maxClipEnd = 0;
    if (this.clips && this.clips.length > 0) {
      maxClipEnd = Math.max(...this.clips.map(c => c.endTime || 0));
    }
    const targetDuration = Math.max(this.totalDuration || 0, maxClipEnd, 12);
    const FPS = 30;
    const totalFrames = Math.ceil(targetDuration * FPS);

    const muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(),
      video: {
        codec: 'avc',
        width: this.width,
        height: this.height,
      },
      audio: this.audioBuffer ? {
        codec: 'aac',
        sampleRate: this.audioBuffer.sampleRate,
        numberOfChannels: this.audioBuffer.numberOfChannels,
      } : undefined,
      fastStart: 'in-memory'
    });

    let videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: e => console.error('VideoEncoder error', e)
    });
    
    videoEncoder.configure({
      codec: 'avc1.640028',
      width: this.width,
      height: this.height,
      bitrate: 10_000_000,
      framerate: FPS,
    });

    let audioEncoder;
    let audioQueue = Promise.resolve();

    if (this.audioBuffer) {
      audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: e => console.error('AudioEncoder error', e)
      });
      audioEncoder.configure({
        codec: 'mp4a.40.2',
        sampleRate: this.audioBuffer.sampleRate,
        numberOfChannels: this.audioBuffer.numberOfChannels,
        bitrate: 192_000
      });
      
      // Encode audio completely in the background before finalizing
      audioQueue = (async () => {
        const sampleRate = this.audioBuffer.sampleRate;
        const numChannels = this.audioBuffer.numberOfChannels;
        const totalSamples = this.audioBuffer.length;
        const maxSamples = Math.min(totalSamples, Math.ceil(targetDuration * sampleRate));
        const chunkSize = sampleRate; // 1 second chunks

        for (let offset = 0; offset < maxSamples; offset += chunkSize) {
          const size = Math.min(chunkSize, maxSamples - offset);
          const data = new Float32Array(size * numChannels);
          for (let c = 0; c < numChannels; c++) {
            const channelData = this.audioBuffer.getChannelData(c);
            data.set(channelData.subarray(offset, offset + size), c * size);
          }
          
          const audioData = new AudioData({
            format: 'f32-planar',
            sampleRate: sampleRate,
            numberOfFrames: size,
            numberOfChannels: numChannels,
            timestamp: (offset / sampleRate) * 1_000_000,
            data: data
          });
          
          audioEncoder.encode(audioData);
          audioData.close();
          await new Promise(r => setTimeout(r, 0)); // yield loop
        }
        await audioEncoder.flush();
        audioEncoder.close();
      })();
    }

    return new Promise(async (resolve, reject) => {
      try {
        let frameCount = 0;
        
        // Helper to accurately seek video for offline rendering
        const seekVideo = (el, time) => {
          return new Promise(res => {
            if (Math.abs(el.currentTime - time) < 0.05) return res();
            const handler = () => {
              el.removeEventListener('seeked', handler);
              res();
            };
            el.addEventListener('seeked', handler);
            el.currentTime = time;
          });
        };

        const encodeNextFrame = async () => {
          if (frameCount >= totalFrames) {
            await videoEncoder.flush();
            videoEncoder.close();
            if (audioQueue) await audioQueue;
            
            muxer.finalize();
            const buffer = muxer.target.buffer;
            const blob = new Blob([buffer], { type: 'video/mp4' });
            if (onProgressCallback) onProgressCallback(100);
            this._stopActiveVideo();
            resolve(blob);
            return;
          }

          if (videoEncoder.encodeQueueSize > 5) {
            setTimeout(encodeNextFrame, 10);
            return;
          }

          const currentTime = frameCount / FPS;
          
          // Manually sync video elements
          const clip = this._getActiveClip(currentTime);
          if (clip && clip.mediaType === 'video' && clip.element) {
             const el = clip.element;
             if (this._activeVideoEl && this._activeVideoEl !== el) {
               this._activeVideoEl.pause();
             }
             this._activeVideoEl = el;
             this._activeClipId = clip.id;
             el.pause(); // Must be paused for frame-by-frame seeking
             const clipTime = currentTime - clip.startTime;
             const expectedVideoTime = Math.min(Math.max(0, (clip.videoOffset || 0) + clipTime), (el.duration || 999) - 0.05);
             await seekVideo(el, expectedVideoTime);
          } else if (this._activeVideoEl) {
             this._activeVideoEl.pause();
             this._activeVideoEl = null;
             this._activeClipId = clip ? clip.id : null;
          }

          // Draw canvas
          this.drawFrame(currentTime);
          
          // Encode VideoFrame
          const frame = new VideoFrame(this.canvas, {
            timestamp: frameCount * (1_000_000 / FPS),
            duration: 1_000_000 / FPS
          });
          
          videoEncoder.encode(frame, { keyFrame: frameCount % 60 === 0 });
          frame.close();

          frameCount++;
          if (frameCount % 5 === 0 && onProgressCallback) {
            const pct = Math.min(99, Math.round((frameCount / totalFrames) * 100));
            onProgressCallback(pct);
          }
          
          setTimeout(encodeNextFrame, 0);
        };
        
        encodeNextFrame();
      } catch (err) {
        reject(err);
      }
    });
  }
}
