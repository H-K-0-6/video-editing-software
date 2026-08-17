import React, { useRef } from 'react';
import { Image, Video, Plus, Trash2, Sparkles } from 'lucide-react';

export default function MediaPicker({ mediaList, onAddMedia, onRemoveMedia, onAddDemoMedia }) {
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    files.forEach((file) => {
      const isVideo = file.type.startsWith('video');
      const url = URL.createObjectURL(file);
      
      let element;
      if (isVideo) {
        element = document.createElement('video');
        element.src = url;
        element.muted = true;
        element.playsInline = true;
        element.preload = 'auto'; // tell browser to buffer the entire file
        element.load();           // start buffering immediately
        element.onloadedmetadata = () => {
          onAddMedia({
            id: 'media_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            type: 'video',
            url,
            name: file.name,
            element,
            videoDuration: element.duration || 5,
          });
        };
      } else {
        element = new window.Image();
        element.src = url;
        element.onload = () => {
          onAddMedia({
            id: 'media_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            type: 'image',
            url,
            name: file.name,
            element,
          });
        };
      }
    });

    e.target.value = '';
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h2 className="section-title">Select Photos & Videos</h2>
          <p className="section-subtitle">Choose your media. The AI handles pacing and cuts.</p>
        </div>
        <button
          onClick={onAddDemoMedia}
          className="secondary-btn"
          style={{ padding: '6px 10px', fontSize: '0.75rem', gap: 4 }}
          title="Load Sample Media"
        >
          <Sparkles size={14} color="#a855f7" /> Load Demo Media
        </button>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        multiple
        accept="image/*,video/*"
        style={{ display: 'none' }}
      />

      <div className="upload-grid">
        {mediaList.map((item, idx) => (
          <div key={item.id} className="media-card">
            {item.type === 'video' ? (
              <video src={item.url} muted playsInline style={{ pointerEvents: 'none' }} />
            ) : (
              <img src={item.url} alt={item.name} />
            )}
            <span className="badge">
              {item.type === 'video' ? <Video size={10} style={{ verticalAlign: 'middle' }} /> : <Image size={10} style={{ verticalAlign: 'middle' }} />} #{idx + 1}
            </span>
            <button
              className="remove-btn"
              onClick={() => onRemoveMedia(item.id)}
              title="Remove"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}

        <div
          className="upload-button-card"
          onClick={() => fileInputRef.current && fileInputRef.current.click()}
        >
          <Plus size={24} color="#6366f1" />
          <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Add Media</span>
        </div>
      </div>
    </div>
  );
}
