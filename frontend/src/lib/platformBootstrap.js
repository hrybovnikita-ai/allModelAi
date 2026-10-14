import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { isCapacitorNative } from './apiBase.js';
import { getNativeShell, isElectronShell, isNativeMultiplatformShell } from './nativePlatform.js';

function applyShellDataset() {
  const html = document.documentElement;
  const shell = getNativeShell();
  html.dataset.shell = shell;
  html.dataset.nativeApp = isNativeMultiplatformShell() ? 'true' : 'false';
  if (isElectronShell()) {
    html.dataset.platform = processPlatformFromElectron();
  } else if (Capacitor.getPlatform() === 'ios') {
    html.dataset.platform = 'ios';
  } else if (Capacitor.getPlatform() === 'android') {
    html.dataset.platform = 'android';
  }
}

function processPlatformFromElectron() {
  if (typeof window === 'undefined') return 'desktop';
  const platform = window.allmodelai?.platform;
  if (platform === 'darwin') return 'mac';
  if (platform === 'win32') return 'windows';
  return 'desktop';
}

async function bindCapacitorLifecycle() {
  if (!isCapacitorNative()) return;
  try {
    await App.addListener('appUrlOpen', ({ url }) => {
      if (!url || typeof window === 'undefined') return;
      try {
        const parsed = new URL(url);
        const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
        if (path && path !== window.location.pathname) {
          window.history.replaceState({}, '', path);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }
      } catch {
        /* ignore malformed deep links */
      }
    });
  } catch {
    /* plugin unavailable in web build */
  }
}

export function initPlatformShell() {
  applyShellDataset();
  void bindCapacitorLifecycle();
  window.addEventListener('resize', applyShellDataset, { passive: true });
}
