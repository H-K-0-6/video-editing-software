import React, { useState } from 'react';
import { Music, Video as YoutubeIcon, Upload, Clock, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';

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
  onLoadDemoTrack,
  statusMessage
}) {
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
      <p className="section-subtitle">Provide a YouTube link with custom timestamps, or upload your own audio file.</p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          className={`secondary-btn ${audioSourceType === 'youtube' ? 'active' : ''}`}
          style={{
            flex: 1,
            background: audioSourceType === 'youtube' ? 'rgba(239, 68, 68, 0.15)' : '',
            borderColor: audioSourceType === 'youtube' ? '#ef4444' : '',
            color: audioSourceType === 'youtube' ? '#fff' : 'var(--text-muted)',
          }}
          onClick={() => setAudioSourceType('youtube')}
        >
          <YoutubeIcon size={16} color="#ef4444" /> YouTube Link
        </button>

        <button
          className={`secondary-btn ${audioSourceType === 'local' ? 'active' : ''}`}
          style={{
            flex: 1,
            background: audioSourceType === 'local' ? 'rgba(99, 102, 241, 0.15)' : '',
            borderColor: audioSourceType === 'local' ? '#6366f1' : '',
            color: audioSourceType === 'local' ? '#fff' : 'var(--text-muted)',
          }}
          onClick={() => setAudioSourceType('local')}
        >
          <Upload size={16} color="#6366f1" /> Local Audio File
        </button>
      </div>

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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Audio Segment (e.g. 01:33 to 02:00)</label>
            <div className="time-range-group">
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Start (MM:SS)</span>
                <input
                  type="text"
                  className="time-input"
                  placeholder="00:15"
                  value={youtubeStartTime}
                  onChange={(e) => setYoutubeStartTime(e.target.value)}
                />
              </div>
              <span style={{ color: 'var(--text-dim)', alignSelf: 'center', marginTop: 14 }}>&rarr;</span>
              <div style={{ flex: 1 }}>
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

      {/* Local Audio Upload Section */}
      {audioSourceType === 'local' && (
        <div className="audio-card">
          <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Select Audio File (.mp3, .wav, .aac, .m4a)</label>
          <input
            type="file"
            accept="audio/*"
            onChange={handleLocalFile}
            className="input-box"
          />
          <button
            className="secondary-btn"
            onClick={onLoadDemoTrack}
            style={{ marginTop: 4, width: '100%' }}
          >
            <Sparkles size={16} color="#a855f7" /> Use High-Energy Royalty-Free Demo Track
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
              Duration: {audioInfo.duration ? `${audioInfo.duration.toFixed(1)}s` : 'Ready'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
