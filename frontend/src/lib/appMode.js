/**
 * True when the UI runs as an installed app (PWA / standalone), not a normal browser tab.
 * Set VITE_STANDALONE_APP=true at build time to force app shell (e.g. Electron wrapper).
 */
export function isStandaloneApp() {
  if (import.meta.env.VITE_STANDALONE_APP === 'true') return true;
  if (typeof window === 'undefined') return false;

  const displayStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches;
  const iosStandalone = Boolean(window.navigator.standalone);
  const androidTwa = document.referrer?.includes('android-app://');

  return Boolean(displayStandalone || iosStandalone || androidTwa);
}
