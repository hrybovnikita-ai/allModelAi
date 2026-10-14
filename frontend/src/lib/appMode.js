import { Capacitor } from '@capacitor/core';

/**
 * True when the UI runs as an installed app (PWA / Capacitor / Electron), not a normal browser tab.
 */
export function isStandaloneApp() {
  if (import.meta.env.VITE_STANDALONE_APP === 'true') return true;
  if (import.meta.env.VITE_ELECTRON === 'true') return true;
  if (import.meta.env.VITE_CAPACITOR_NATIVE === 'true') return true;
  if (typeof window === 'undefined') return false;

  try {
    if (Capacitor.isNativePlatform()) return true;
  } catch {
    /* web build */
  }
  if (window.allmodelai?.isElectron) return true;

  const displayStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches;
  const iosStandalone = Boolean(window.navigator.standalone);
  const androidTwa = document.referrer?.includes('android-app://');

  return Boolean(displayStandalone || iosStandalone || androidTwa);
}
