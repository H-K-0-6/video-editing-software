import React, { useState } from 'react';
import { Music, Video as YoutubeIcon, Upload, Sparkles, Play, CheckCircle2, Volume2 } from 'lucide-react';

export const PRESET_SOUNDTRACKS = [
  {
    id: 'phonk',
    title: 'High-Energy Phonk Drop',
    genre: 'Phonk / Drift',
    emoji: '⚡',
    duration: 15,
    color: '#ef4444',
    url: 'https://cdn.freesound.org/previews/568/568853_11861866-lq.mp3',
  },
  {
    id: 'cyberpunk',
    title: 'Cyberpunk Bass Hype',
    genre: 'EDM / Club',
    emoji: '🎧',
    duration: 20,
    color: '#8b5cf6',
    url: 'https://cdn.freesound.org/previews/530/530415_1648170-lq.mp3',
  },
  {
    id: 'lofi',
    title: 'Sunset Chill Aesthetic',
    genre: 'Lo-Fi / Relaxed',
    emoji: '🌊',
    duration: 18,
    color: '#3b82f6',
    url: 'https://cdn.freesound.org/previews/573/573381_11861866-lq.mp3',
  },
  {
    id: 'cinematic',
    title: 'Trailer Action Impact',
    genre: 'Cinematic / Epic',
    emoji: '🎬',
    duration: 16,
    color: '#f59e0b',
    url: 'https://cdn.freesound.org/previews/689/689504_11861866-lq.mp3',
  },
  {
    id: 'funk',
    title: 'Upbeat Funk Groove',
    genre: 'Pop / Groovy',
    emoji: '🕺',
    duration: 15,
    color: '#10b981',
    url: 'https://cdn.freesound.org/previews/538/538554_11861866-lq.mp3',
  },
];

export default function AudioPicker({
  audioSourceType,
  setAudioSourceType,
  youtubeUrl,
  setYoutubeUrl,
  youtubeStartTime,
  setYoutubeStartTime,
  youtubeEndTime,
  setYoutubeEndTime,
  onLocalAudioSelected,
  onFetchYoutubeAudio,
  audioInfo,
  isLoadingAudio,
  onLoadPresetTrack,
  statusMessage
}) {
  const [activePreviewId, setActivePreviewId] = useState(null);

  const handleLocalFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    onLocalAudioSelected({
      type: 'local',
      url,
      name: file.name,
      file,
    });
  };

  return (
    <div>
      <h2 className="section-title">Background Audio Track</h2>
      <p className="section-subtitle">Pick from high-energy curated beats, upload your own music file, or paste a YouTube URL.</p>

      {/* Modern Tabs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        <button
          className={`secondary-btn ${audioSourceType === 'preset' ? 'active' : ''}`}
          style={{
            background: audioSourceType === 'preset' ? 'rgba(168, 85, 247, 0.18)' : '',
            borderColor: audioSourceType === 'preset' ? '#a855f7' : '',
            color: audioSourceType === 'preset' ? '#fff' : 'var(--text-muted)',
            fontSize: '0.8rem',
            padding: '10px 4px',
            justifyContent: 'center',
          }}
          onClick={() => setAudioSourceType('preset')}
        >
          <Sparkles size={15} color="#a855f7" /> Soundtracks
        </button>

        <button
          className={`secondary-btn ${audioSourceType === 'local' ? 'active' : ''}`}
          style={{
            background: audioSourceType === 'local' ? 'rgba(99, 102, 241, 0.18)' : '',
            borderColor: audioSourceType === 'local' ? '#6366f1' : '',
            color: audioSourceType === 'local' ? '#fff' : 'var(--text-muted)',
            fontSize: '0.8rem',
            padding: '10px 4px',
            justifyContent: 'center',
          }}
          onClick={() => setAudioSourceType('local')}
        >
          <Upload size={15} color="#6366f1" /> My Music
        </button>

        <button
          className={`secondary-btn ${audioSourceType === 'youtube' ? 'active' : ''}`}
          style={{
            background: audioSourceType === 'youtube' ? 'rgba(239, 68, 68, 0.18)' : '',
            borderColor: audioSourceType === 'youtube' ? '#ef4444' : '',
            color: audioSourceType === 'youtube' ? '#fff' : 'var(--text-muted)',
            fontSize: '0.8rem',
            padding: '10px 4px',
            justifyContent: 'center',
          }}
          onClick={() => setAudioSourceType('youtube')}
        >
          <YoutubeIcon size={15} color="#ef4444" /> YouTube
        </button>
      </div>

      {/* Preset Soundtracks Grid (1-Tap on Phone) */}
      {audioSourceType === 'preset' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: 2 }}>
            ⚡ 1-Tap Ready Tracks with Automatic Beat Drops:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {PRESET_SOUNDTRACKS.map((track) => {
              const isSelected = audioInfo && audioInfo.name && audioInfo.name.includes(track.title);
              return (
                <div
                  key={track.id}
                  onClick={() => {
                    setActivePreviewId(track.id);
                    onLoadPresetTrack(track);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: isSelected
                      ? 'rgba(168, 85, 247, 0.15)'
                      : 'rgba(255, 255, 255, 0.03)',
                    border: isSelected
                      ? `1px solid ${track.color}`
                      : '1px solid rgba(255, 255, 255, 0.08)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      fontSize: '1.4rem',
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      background: 'rgba(255, 255, 255, 0.06)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {track.emoji}
                    </div>
                    <div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: isSelected ? '#fff' : 'var(--text-main)' }}>
                        {track.title}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {track.genre} • {track.duration}s
                      </div>
                    </div>
                  </div>

                  <button
                    className="secondary-btn"
                    style={{
                      padding: '6px 12px',
                      fontSize: '0.75rem',
                      borderRadius: 'var(--radius-sm)',
                      background: isSelected ? track.color : 'rgba(255, 255, 255, 0.06)',
                      color: isSelected ? '#fff' : 'var(--text-muted)',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {isSelected ? <CheckCircle2 size={14} /> : <Play size={12} fill="currentColor" />}
                    {isSelected ? 'Active' : 'Use'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Local Audio Upload Section */}
      {audioSourceType === 'local' && (
        <div className="audio-card">
          <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Choose any song from your phone (.mp3, .wav, .m4a)</label>
          <input
            type="file"
            accept="audio/*"
            onChange={handleLocalFile}
            className="input-box"
          />
          <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: 4 }}>
            💡 Tip: Any downloaded songs or audio files on your phone work instantly with 0 loading time!
          </p>
        </div>
      )}

      {/* YouTube Section */}
      {audioSourceType === 'youtube' && (
        <div className="audio-card">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>YouTube URL</label>
            <input
              type="text"
              className="input-box"
              placeholder="e.g. https://www.youtube.com/watch?v=dQw4w9WgXcQ"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', boxSizing: 'border-box' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Audio Segment (e.g. 01:33 to 02:00)</label>
            <div className="time-range-group">
              <div className="time-input-col">
                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Start (MM:SS)</span>
                <input
                  type="text"
                  className="time-input"
                  placeholder="00:15"
                  value={youtubeStartTime}
                  onChange={(e) => setYoutubeStartTime(e.target.value)}
                />
              </div>
              <span style={{ color: 'var(--text-dim)', alignSelf: 'flex-end', marginBottom: 8, flexShrink: 0 }}>&rarr;</span>
              <div className="time-input-col">
                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>End (MM:SS)</span>
                <input
                  type="text"
                  className="time-input"
                  placeholder="00:35"
                  value={youtubeEndTime}
                  onChange={(e) => setYoutubeEndTime(e.target.value)}
                />
              </div>
            </div>
          </div>

          <button
            className="primary-btn"
            onClick={onFetchYoutubeAudio}
            disabled={!youtubeUrl || isLoadingAudio}
            style={{ marginTop: 8 }}
          >
            <Music size={18} />
            {isLoadingAudio ? (statusMessage || 'Extracting & Slicing Track...') : 'Fetch & Load Audio'}
          </button>
        </div>
      )}

      {/* Audio Loaded Indicator */}
      {audioInfo && (
        <div style={{
          marginTop: 12,
          padding: '10px 14px',
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <CheckCircle2 size={20} color="#10b981" />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>
              {audioInfo.name || 'Audio Loaded'}
            </div>
            <div style={{ fontSize: '0.7rem', color: '#10b981' }}>
              Duration: {audioInfo.duration ? `${audioInfo.duration.toFixed(1)}s` : 'Ready'} • Beat drop synced
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
