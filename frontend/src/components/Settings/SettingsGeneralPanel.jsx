import { useState } from 'react';

const THEMES = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'auto', label: 'System' },
];

function readAppearance() {
  try {
    return JSON.parse(localStorage.getItem('allmodelai_appearance') || '{}');
  } catch {
    return {};
  }
}

function applyTheme(theme) {
  const current = readAppearance();
  const next = { ...current, theme };
  localStorage.setItem('allmodelai_appearance', JSON.stringify(next));
  document.documentElement.dataset.themePreference = theme;
  document.documentElement.dataset.theme = theme === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : theme;
}

export default function SettingsGeneralPanel({
  selectedLanguage,
  languages,
  onLanguageChange,
  responseLanguage,
  responseLanguageOptions,
  onResponseLanguageChange,
}) {
  const [theme, setTheme] = useState(() => readAppearance().theme || 'dark');

  const changeTheme = (value) => {
    setTheme(value);
    applyTheme(value);
  };

  return (
    <section id="settings-general" className="settings-card">
      <div>
        <span>General</span>
        <h2>Language & appearance</h2>
        <p className="settings-security-hint">
          Interface language, theme, and AI response language preferences.
        </p>
      </div>
      <div className="settings-fields">
        <label>
          Language
          <select value={selectedLanguage} onChange={onLanguageChange}>
            {languages.map((language) => (
              <option key={language.name} value={language.name}>{language.native}</option>
            ))}
          </select>
        </label>
        <label>
          Appearance
          <select value={theme} onChange={(event) => changeTheme(event.target.value)}>
            {THEMES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          AI response language
          <select value={responseLanguage} onChange={onResponseLanguageChange}>
            {responseLanguageOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <p className="settings-field-hint">
          Auto-detect follows your message text. Explicit instructions in chat still override this setting.
        </p>
      </div>
    </section>
  );
}
