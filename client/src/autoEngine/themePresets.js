/**
 * Theme & Aesthetic Style Presets for Auto Montage Generation
 */

export const THEMES = [
  {
    id: 'tiktok_beat',
    name: '⚡ Viral Beat Reel',
    description: 'Ultra-fast cuts synced to every beat, whip transitions, flash bursts, and high energy.',
    targetCutDuration: [0.8, 1.8], // min/max clip duration in seconds
    transitionType: 'flash_zoom',
    colorFilter: 'contrast(1.15) saturate(1.25) brightness(1.02)',
    badge: 'Popular',
    accentColor: '#ff007f',
  },
  {
    id: 'cinematic_film',
    name: '🎬 Cinematic Film',
    description: 'Slow dramatic Ken Burns zooms, gentle cross-dissolves, rich warm film grading.',
    targetCutDuration: [2.5, 4.2],
    transitionType: 'crossfade',
    colorFilter: 'sepia(0.08) contrast(1.08) brightness(0.98) saturate(1.12)',
    badge: 'Cinematic',
    accentColor: '#eab308',
  },
  {
    id: 'chill_memories',
    name: '🌿 Chill Memories',
    description: 'Smooth floating pans, soft fades, pastel clean aesthetics for lifestyle and travel.',
    targetCutDuration: [2.0, 3.5],
    transitionType: 'soft_slide',
    colorFilter: 'brightness(1.05) saturate(1.1) contrast(1.02)',
    badge: 'Smooth',
    accentColor: '#10b981',
  },
  {
    id: 'retro_vhs',
    name: '📼 Vintage / Retro',
    description: 'Nostalgic film look with warm tones, rhythmic cuts, and vintage vignette feel.',
    targetCutDuration: [1.2, 2.5],
    transitionType: 'retro_glitch',
    colorFilter: 'sepia(0.2) contrast(1.18) hue-rotate(-10deg) saturate(1.3)',
    badge: 'Retro',
    accentColor: '#8b5cf6',
  },
];
