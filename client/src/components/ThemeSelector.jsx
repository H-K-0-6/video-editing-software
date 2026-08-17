import React from 'react';
import { THEMES } from '../autoEngine/themePresets';
import { Check } from 'lucide-react';

export default function ThemeSelector({ selectedTheme, onSelectTheme }) {
  return (
    <div>
      <h2 className="section-title">Select Editing Vibe / Theme</h2>
      <p className="section-subtitle">Choose the style; the AI calculates cuts, speed, and motion.</p>

      <div className="theme-grid">
        {THEMES.map((theme) => {
          const isSelected = selectedTheme === theme.id;
          return (
            <div
              key={theme.id}
              className={`theme-card ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectTheme(theme.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="theme-name">{theme.name}</span>
                {isSelected && <Check size={16} color="#6366f1" />}
              </div>
              <p className="theme-desc">{theme.description}</p>
              <div style={{
                marginTop: 'auto',
                fontSize: '0.65rem',
                color: theme.accentColor,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                {theme.badge}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
