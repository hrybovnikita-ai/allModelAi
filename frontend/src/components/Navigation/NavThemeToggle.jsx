import { useEffect, useState } from 'react';

const THEME_CYCLE = ['dark', 'light', 'auto'];

function readThemePreference() {
  try {
    const raw = JSON.parse(localStorage.getItem('allmodelai_appearance') || '{}');
    return THEME_CYCLE.includes(raw.theme) ? raw.theme : 'dark';
  } catch {
    return 'dark';
  }
}

function applyThemePreference(theme) {
  const current = (() => {
    try {
      return JSON.parse(localStorage.getItem('allmodelai_appearance') || '{}');
    } catch {
      return {};
    }
  })();
  const next = { ...current, theme };
  localStorage.setItem('allmodelai_appearance', JSON.stringify(next));
  document.documentElement.dataset.themePreference = theme;
  document.documentElement.dataset.theme = theme === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : theme;
}

function ThemeIcon({ theme }) {
  if (theme === 'light') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (theme === 'auto') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <path d="M12 3v18A9 9 0 0 0 12 3z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

/** Lucide-style cycle control: dark → light → system. */
export default function NavThemeToggle() {
  const [theme, setTheme] = useState(readThemePreference);

  useEffect(() => {
    applyThemePreference(theme);
  }, [theme]);

  const cycle = () => {
    setTheme((current) => {
      const index = THEME_CYCLE.indexOf(current);
      return THEME_CYCLE[(index + 1) % THEME_CYCLE.length];
    });
  };

  const label = theme === 'auto' ? 'System theme' : theme === 'light' ? 'Light theme' : 'Dark theme';

  return (
    <button
      type="button"
      className="fg-nav-theme-toggle"
      aria-label={`${label}. Click to change.`}
      title={label}
      onClick={cycle}
    >
      <ThemeIcon theme={theme} />
    </button>
  );
}
