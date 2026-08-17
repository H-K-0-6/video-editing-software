import React, { useState, useRef, useEffect } from 'react';
import MediaPicker from './components/MediaPicker';
import AudioPicker from './components/AudioPicker';
import ThemeSelector from './components/ThemeSelector';
import VideoPreview from './components/VideoPreview';
import { VideoRenderEngine } from './autoEngine/renderPipeline';
import { analyzeAudioBeats } from './autoEngine/beatDetector';
import { generateMontageTimeline } from './autoEngine/montageBuilder';
import { Sparkles, Wand2, Smartphone, ArrowRight, ArrowLeft, RefreshCw, CheckCircle } from 'lucide-react';

const BACKEND_URL = typeof window !== 'undefined' && (
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.hostname.startsWith('192.168.') ||
  window.location.hostname.startsWith('10.') ||
  window.location.hostname.startsWith('172.')
)
  ? `http://${window.location.hostname}:3001`
  : 'https://video-editing-software-ccmx.onrender.com';

export default function App() {
  const [currentStep, setCurrentStep] = useState(1); // 1: Media, 2: Audio, 3: Vibe/Generate, 4: Preview
  const [mediaList, setMediaList] = useState([]);
  
  // Audio state
  const [audioSourceType, setAudioSourceType] = useState('preset');
  const [youtubeUrl, setYoutubeUrl] = useState('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  const [youtubeStartTime, setYoutubeStartTime] = useState('00:15');
  const [youtubeEndTime, setYoutubeEndTime] = useState('00:35');
  const [audioInfo, setAudioInfo] = useState(null);
  const [audioBuffer, setAudioBuffer] = useState(null);
  const [audioElement, setAudioElement] = useState(null);
  const [detectedBeats, setDetectedBeats] = useState([]);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);

  // Theme & Generation state
  const [selectedTheme, setSelectedTheme] = useState('tiktok_beat');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedClips, setGeneratedClips] = useState([]);
  const [totalDuration, setTotalDuration] = useState(15);

  // Export state
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const engineRef = useRef(null);
  const audioContextRef = useRef(null);

  useEffect(() => {
    // Instantiate dummy engine canvas on mount
    const canvas = document.createElement('canvas');
    engineRef.current = new VideoRenderEngine(canvas, { width: 720, height: 1280 });
  }, []);

  // Helper to parse MM:SS string to seconds
  const parseTimeToSeconds = (str) => {
    if (!str) return 0;
    const parts = str.split(':').map(p => parseFloat(p.trim()) || 0);
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return parseFloat(str) || 0;
  };

  // Add media item
  const handleAddMedia = (item) => {
    setMediaList(prev => [...prev, item]);
  };

  // Remove media item
  const handleRemoveMedia = (id) => {
    setMediaList(prev => prev.filter(m => m.id !== id));
  };

  // Load demo sample media (images from high quality Unsplash)
  const handleAddDemoMedia = () => {
    const demoImages = [
      { name: 'City Skyline', url: 'https://images.unsplash.com/photo-1514565131-fce0801e5785?w=800&auto=format&fit=crop&q=80' },
      { name: 'Mountain Peak', url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&auto=format&fit=crop&q=80' },
      { name: 'Beach Sunset', url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=80' },
      { name: 'Cyber Neon', url: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=800&auto=format&fit=crop&q=80' },
      { name: 'Forest Trail', url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=800&auto=format&fit=crop&q=80' },
      { name: 'Night Highway', url: 'https://images.unsplash.com/photo-1509228468518-180dd4864904?w=800&auto=format&fit=crop&q=80' },
    ];

    demoImages.forEach(imgData => {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.src = imgData.url;
      img.onload = () => {
        handleAddMedia({
          id: 'demo_' + Math.random().toString(36).substr(2, 9),
          type: 'image',
          url: imgData.url,
          name: imgData.name,
          element: img,
        });
      };
    });
  };

  // Decode audio buffer and run beat detection
  const processAudioBuffer = async (arrayBuffer, name, customDuration) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const decoded = await audioContextRef.current.decodeAudioData(arrayBuffer.slice(0));
    setAudioBuffer(decoded);

    // Detect beats
    const beats = await analyzeAudioBeats(decoded);
    setDetectedBeats(beats);

    const dur = customDuration || decoded.duration;
    setTotalDuration(dur);
    setAudioInfo({
      name,
      duration: dur,
    });
  };

  // Load curated soundtrack preset track (1-tap on phone)
  const handleLoadPresetTrack = async (track) => {
    setIsLoadingAudio(true);
    try {
      const audioEl = new Audio();
      audioEl.crossOrigin = 'anonymous';
      audioEl.src = track.url;
      audioEl.preload = 'auto';
      setAudioElement(audioEl);

      const resp = await fetch(track.url);
      const ab = await resp.arrayBuffer();
      await processAudioBuffer(ab, `${track.title} (${track.genre})`, track.duration || 15);
    } catch (err) {
      console.error('Preset audio error:', err);
    } finally {
      setIsLoadingAudio(false);
    }
  };

  const handleLoadDemoTrack = async () => {
    handleLoadPresetTrack({
      title: 'High Energy Beat',
      genre: 'EDM',
      url: 'https://cdn.freesound.org/previews/568/568853_11861866-lq.mp3',
      duration: 15,
    });
  };

  // Local audio file selected
  const handleLocalAudioSelected = async ({ url, name, file }) => {
    setIsLoadingAudio(true);
    try {
      const audioEl = new Audio();
      audioEl.src = url;
      audioEl.preload = 'auto';
      setAudioElement(audioEl);

      const ab = await file.arrayBuffer();
      await processAudioBuffer(ab, name);
    } catch (err) {
      console.error('Local audio decode error:', err);
    } finally {
      setIsLoadingAudio(false);
    }
  };

  const [statusMessage, setStatusMessage] = useState('');

  // Fetch YouTube audio via proxy or resilient public instance
  const handleFetchYoutubeAudio = async () => {
    if (!youtubeUrl) return;
    setIsLoadingAudio(true);
    setStatusMessage('Connecting to audio source...');
    try {
      const startSec = parseTimeToSeconds(youtubeStartTime);
      const endSec = parseTimeToSeconds(youtubeEndTime);
      const sliceDuration = endSec > startSec ? endSec - startSec : 15;

      setStatusMessage('Extracting & trimming audio...');
      const { fetchYouTubeAudioStream } = await import('./autoEngine/youtubeExtractor');
      const { buffer, name } = await fetchYouTubeAudioStream({
        url: youtubeUrl,
        startTimeSec: startSec,
        endTimeSec: endSec,
        backendUrl: BACKEND_URL,
      });

      setStatusMessage('Decoding audio buffer...');
      // The buffer is already trimmed server-side — starts at t=0, mp3 format
      const audioBlob = new Blob([buffer], { type: 'audio/mpeg' });
      const audioBlobUrl = URL.createObjectURL(audioBlob);

      const audioEl = new Audio();
      audioEl.src = audioBlobUrl;
      audioEl.preload = 'auto';
      // NOTE: do NOT set audioEl.currentTime here — the slice already starts at 0
      setAudioElement(audioEl);

      await processAudioBuffer(buffer, name, sliceDuration);
      setStatusMessage('');
    } catch (err) {
      console.error('YouTube audio extraction error:', err);
      alert(`Unable to extract audio for this YouTube URL.\n\nError from server: ${err.message}\n\nTip: You can upload any local audio file or click "Use High-Energy Demo Track" to proceed without YouTube!`);
    } finally {
      setIsLoadingAudio(false);
      setStatusMessage('');
    }
  };

  // 1-Click Auto Video Generation
  const handleAutoGenerate = () => {
    if (mediaList.length === 0) {
      alert('Please add at least 1 photo or video first!');
      return;
    }

    setIsGenerating(true);
    setTimeout(() => {
      const duration = audioInfo?.duration || 15;
      const clips = generateMontageTimeline(mediaList, duration, detectedBeats, selectedTheme);
      setGeneratedClips(clips);
      setIsGenerating(false);
      setCurrentStep(4); // Advance to preview player
    }, 400);
  };

  // Export generated video
  const handleExport = async () => {
    if (!engineRef.current || generatedClips.length === 0) return;
    setIsExporting(true);
    setExportProgress(0);

    try {
      const blob = await engineRef.current.exportVideo((pct) => setExportProgress(pct));
      const isMp4 = blob.type && blob.type.includes('mp4');
      const ext = isMp4 ? 'mp4' : 'webm';
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `AutoReel_${selectedTheme}_${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('Export error:', err);
      alert('Video export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="app-container">
      <div className="mobile-shell">
        {/* Header */}
        <header className="app-header">
          <div className="logo-wrap">
            <div className="logo-badge">
              <Sparkles size={20} color="#fff" />
            </div>
            <div className="logo-text">
              <h1>Auto Reel Maker</h1>
              <p>AI Beat-Synced Montage</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '4px 8px', borderRadius: 20 }}>
            <Smartphone size={12} /> APK Ready
          </div>
        </header>

        {/* Wizard Step Progress */}
        <div className="step-indicator">
          <div className={`step-tab ${currentStep === 1 ? 'active' : ''} ${currentStep > 1 ? 'completed' : ''}`} onClick={() => setCurrentStep(1)}>
            <span>1. Media</span>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>{mediaList.length} items</span>
          </div>
          <div className={`step-tab ${currentStep === 2 ? 'active' : ''} ${currentStep > 2 ? 'completed' : ''}`} onClick={() => setCurrentStep(2)}>
            <span>2. Audio</span>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>{audioInfo ? 'Loaded' : 'Select'}</span>
          </div>
          <div className={`step-tab ${currentStep === 3 ? 'active' : ''} ${currentStep > 3 ? 'completed' : ''}`} onClick={() => setCurrentStep(3)}>
            <span>3. Vibe</span>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>Style</span>
          </div>
          <div className={`step-tab ${currentStep === 4 ? 'active' : ''}`} onClick={() => generatedClips.length > 0 && setCurrentStep(4)}>
            <span>4. Auto Video</span>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>Preview</span>
          </div>
        </div>

        {/* Main Content Step Views */}
        <main className="content-body">
          {currentStep === 1 && (
            <div>
              <MediaPicker
                mediaList={mediaList}
                onAddMedia={handleAddMedia}
                onRemoveMedia={handleRemoveMedia}
                onAddDemoMedia={handleAddDemoMedia}
              />
              <button
                className="primary-btn"
                style={{ marginTop: 24 }}
                disabled={mediaList.length === 0}
                onClick={() => setCurrentStep(2)}
              >
                Next: Choose Audio <ArrowRight size={18} />
              </button>
            </div>
          )}

          {currentStep === 2 && (
            <div>
              <AudioPicker
                audioSourceType={audioSourceType}
                setAudioSourceType={setAudioSourceType}
                youtubeUrl={youtubeUrl}
                setYoutubeUrl={setYoutubeUrl}
                youtubeStartTime={youtubeStartTime}
                setYoutubeStartTime={setYoutubeStartTime}
                youtubeEndTime={youtubeEndTime}
                setYoutubeEndTime={setYoutubeEndTime}
                onLocalAudioSelected={handleLocalAudioSelected}
                onFetchYoutubeAudio={handleFetchYoutubeAudio}
                audioInfo={audioInfo}
                isLoadingAudio={isLoadingAudio}
                onLoadPresetTrack={handleLoadPresetTrack}
                statusMessage={statusMessage}
              />
              <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
                <button className="secondary-btn" onClick={() => setCurrentStep(1)}>
                  <ArrowLeft size={16} /> Back
                </button>
                <button
                  className="primary-btn"
                  onClick={() => setCurrentStep(3)}
                  disabled={!audioInfo}
                >
                  Next: Pick Style <ArrowRight size={18} />
                </button>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div>
              <ThemeSelector
                selectedTheme={selectedTheme}
                onSelectTheme={setSelectedTheme}
              />
              <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
                <button className="secondary-btn" onClick={() => setCurrentStep(2)}>
                  <ArrowLeft size={16} /> Back
                </button>
                <button
                  className="primary-btn"
                  onClick={handleAutoGenerate}
                  disabled={isGenerating}
                >
                  <Wand2 size={18} />
                  {isGenerating ? 'Generating Video...' : 'Auto-Generate Video'}
                </button>
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h2 className="section-title" style={{ marginBottom: 0 }}>Generated Reel</h2>
                <button
                  className="secondary-btn"
                  style={{ padding: '6px 12px', fontSize: '0.75rem', gap: 4 }}
                  onClick={() => setCurrentStep(3)}
                >
                  <RefreshCw size={12} /> Switch Theme
                </button>
              </div>

              <VideoPreview
                engineRef={engineRef}
                clips={generatedClips}
                audioElement={audioElement}
                audioBuffer={audioBuffer}
                totalDuration={totalDuration}
                onExport={handleExport}
                isExporting={isExporting}
                exportProgress={exportProgress}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
