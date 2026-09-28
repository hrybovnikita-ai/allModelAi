import { Capacitor } from '@capacitor/core';

const stripTrailingSlash = (value) => String(value || '').replace(/\/$/, '');

/** Default production API (Vercel rewrites /api to backend). */
export const DEFAULT_PRODUCTION_API_ORIGIN = stripTrailingSlash(
  import.meta.env?.VITE_PRODUCTION_API_URL
    || import.meta.env?.VITE_PUBLIC_APP_URL
    || 'https://all-model-ai.vercel.app',
);

/** Android emulator → host machine (backend default port 5050; override with env). */
export const DEFAULT_ANDROID_EMULATOR_API_ORIGIN = stripTrailingSlash(
  import.meta.env?.VITE_ANDROID_EMULATOR_API_URL || 'http://10.0.2.2:5050',
);

export function getCapacitorPlatform() {
  try {
    const fromGlobal = typeof window !== 'undefined' ? window.Capacitor?.getPlatform?.() : null;
    if (fromGlobal && fromGlobal !== 'web') return fromGlobal;
    return Capacitor.getPlatform();
  } catch {
    return 'web';
  }
}

/**
 * Capacitor Android/iOS serves bundled assets at https://localhost (no port).
 * Relative /api/... then hits the WebView shell (HTML), not your backend.
 */
export function isCapacitorWebViewHost(location = typeof window !== 'undefined' ? window.location : null) {
  if (!location) return false;
  const protocol = String(location.protocol || '').toLowerCase();
  const hostname = String(location.hostname || '').toLowerCase();
  const port = String(location.port || '');

  if (protocol === 'capacitor:' || protocol === 'ionic:') return true;
  if (hostname !== 'localhost') return false;

  // Vite dev server — keep relative /api + proxy
  if (port === '5173' || port === '4173') return false;

  // Capacitor WebView: https://localhost or http://localhost without a dev port
  if (protocol === 'https:' && port === '') return true;
  if (protocol === 'http:' && port === '' && !import.meta.env?.DEV) return true;

  return false;
}

export function isCapacitorNative() {
  if (import.meta.env?.VITE_CAPACITOR_NATIVE === 'true') return true;

  try {
    if (Capacitor.isNativePlatform()) return true;
  } catch {
    /* ignore */
  }

  try {
    if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) return true;
  } catch {
    /* ignore */
  }

  const platform = getCapacitorPlatform();
  if (platform && platform !== 'web') return true;

  return isCapacitorWebViewHost();
}

export function requiresAbsoluteApiBase() {
  return isCapacitorNative() || isCapacitorWebViewHost();
}

function shouldUseAndroidEmulatorApi() {
  if (import.meta.env?.VITE_CAPACITOR_USE_LOCAL_API === 'true') return true;
  if (import.meta.env?.VITE_CAPACITOR_USE_LOCAL_API === 'false') return false;
  // Local Capacitor debug builds: prefer host loopback unless production API is forced
  if (import.meta.env?.DEV && getCapacitorPlatform() === 'android') return true;
  return false;
}

/**
 * Absolute API origin for native / Capacitor WebView, or '' for normal browser dev/prod same-origin.
 */
export function getApiBase() {
  const explicit = stripTrailingSlash(import.meta.env?.VITE_API_BASE_URL);
  if (explicit) return explicit;

  if (!requiresAbsoluteApiBase()) return '';

  if (getCapacitorPlatform() === 'android' && shouldUseAndroidEmulatorApi()) {
    return DEFAULT_ANDROID_EMULATOR_API_ORIGIN;
  }

  return DEFAULT_PRODUCTION_API_ORIGIN;
}

export function resolveApiUrl(path) {
  if (!path) return getApiBase() || '/';
  if (/^https?:\/\//i.test(path)) return path;

  const normalized = path.startsWith('/') ? path : `/${path}`;
  const base = getApiBase();
  return base ? `${base}${normalized}` : normalized;
}

export function nativeClientHeaders() {
  if (!requiresAbsoluteApiBase()) return {};
  return { 'X-AllModelAI-Client': 'capacitor' };
}
