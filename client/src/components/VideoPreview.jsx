import React, { useRef, useEffect, useState } from 'react';
import { Play, Pause, RotateCcw, Download, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function VideoPreview({
  engineRef,
  clips,
  audioElement,
  audioBuffer,
  totalDuration,
  onExport,
  isExporting,
  exportProgress
}) {
  const canvasRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!engineRef.current || !canvasRef.current) return;

    engineRef.current.setCanvas(canvasRef.current);

    setIsLoading(true);
    engineRef.current.setProject({
      clips,
      audioElement,
      audioBuffer,
      totalDuration,
      onProgress: (cur) => setCurrentTime(cur),
      onEnded: () => {
        setIsPlaying(false);
        try { confetti({ particleCount: 35, spread: 60, origin: { y: 0.85 } }); } catch (e) {}
      }
    }).then(() => {
      setIsLoading(false);
      engineRef.current.drawFrame(0);
    });

    return () => {
      if (engineRef.current) engineRef.current.pause();
    };
  }, [clips, audioElement, audioBuffer, totalDuration]);

  const togglePlay = () => {
    if (!engineRef.current) return;
    if (isPlaying) {
      engineRef.current.pause();
      setIsPlaying(false);
    } else {
      engineRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleRestart = () => {
    if (!engineRef.current) return;
    engineRef.current.seek(0);
    setCurrentTime(0);
    setIsPlaying(false);
  };

  const handleSeek = (e) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (engineRef.current) {
      engineRef.current.seek(time);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="player-container">
      {/* 9:16 Vertical Video Canvas */}
      <div className="canvas-wrapper">
        <canvas ref={canvasRef} width={720} height={1280} />

        {/* Buffering spinner */}
        {isLoading && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: 'rgba(9, 10, 15, 0.8)', gap: 12,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              border: '3px solid rgba(99,102,241,0.25)',
              borderTop: '3px solid #6366f1',
              animation: 'spin 0.8s linear infinite',
            }} />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Buffering media…</span>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Play button overlay */}
        {!isLoading && !isPlaying && currentTime === 0 && (
          <div
            onClick={togglePlay}
            style={{
              position: 'absolute', inset: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0, 0, 0, 0.35)', cursor: 'pointer',
            }}
          >
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'var(--primary-gradient)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 20px rgba(99, 102, 241, 0.6)'
            }}>
              <Play size={28} color="#fff" style={{ marginLeft: 4 }} />
            </div>
          </div>
        )}
      </div>

      {/* Scrubber & Time */}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <input
          type="range"
          min="0"
          max={totalDuration || 1}
          step="0.05"
          value={currentTime}
          onChange={handleSeek}
          style={{ width: '100%', accentColor: 'var(--primary-accent)', cursor: 'pointer' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(totalDuration)}</span>
        </div>
      </div>

      {/* Control Bar */}
      <div className="player-controls">
        <button className="secondary-btn" onClick={handleRestart} title="Restart">
          <RotateCcw size={16} />
        </button>

        <button className="primary-btn" onClick={togglePlay} style={{ width: 'auto', padding: '10px 24px' }}>
          {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          {isPlaying ? 'Pause' : 'Play Preview'}
        </button>

        <button
          className="secondary-btn"
          onClick={onExport}
          disabled={isExporting}
          style={{ background: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.4)', color: '#10b981' }}
          title="Export Video"
        >
          <Download size={16} />
        </button>
      </div>

      {/* Export status */}
      {isExporting && (
        <div style={{
          width: '100%',
          padding: 14,
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-color)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Sparkles size={16} color="#a855f7" /> Rendering High-Quality MP4 ({exportProgress}%)
          </div>
          <div style={{
            width: '100%',
            height: 6,
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: 3,
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${exportProgress}%`,
              height: '100%',
              background: 'var(--primary-gradient)',
              transition: 'width 0.15s ease'
            }} />
          </div>
        </div>
      )}
    </div>
  );
}
