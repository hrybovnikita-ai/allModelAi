import { Capacitor } from '@capacitor/core';

const stripTrailingSlash = (value) => String(value || '').replace(/\/$/, '');

/** Baked at build time for Capacitor (`VITE_API_BASE_URL` in `.env.capacitor`). */
const ENV_API_BASE = stripTrailingSlash(import.meta.env?.VITE_API_BASE_URL);

/** Optional split-deploy fallback when the SPA is on Vercel and /api is not proxied. */
const ENV_REMOTE_API_FALLBACK = stripTrailingSlash(
  import.meta.env?.VITE_REMOTE_API_FALLBACK
    || import.meta.env?.VITE_RENDER_API_ORIGIN
    || '',
);

/** Default host loopback for Android emulator when native (override port via env). */
export const DEFAULT_CAPACITOR_NATIVE_API_ORIGIN = stripTrailingSlash(
  import.meta.env?.VITE_NATIVE_API_URL
    || import.meta.env?.VITE_ANDROID_EMULATOR_API_URL
    || 'http://10.0.2.2:5050',
);

/** Optional production API for store builds: set VITE_CAPACITOR_USE_PRODUCTION=true + VITE_PRODUCTION_API_URL */
export const DEFAULT_PRODUCTION_API_ORIGIN = stripTrailingSlash(
  import.meta.env?.VITE_PRODUCTION_API_URL
    || import.meta.env?.VITE_PUBLIC_APP_URL
    || 'https://all-model-ai.vercel.app',
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

export function isCapacitorWebViewHost(location = typeof window !== 'undefined' ? window.location : null) {
  if (!location) return false;
  const protocol = String(location.protocol || '').toLowerCase();
  const hostname = String(location.hostname || '').toLowerCase();
  const port = String(location.port || '');

  if (protocol === 'capacitor:' || protocol === 'ionic:') return true;
  if (hostname !== 'localhost') return false;
  // Vite dev / preview — keep relative /api + proxy
  if (port === '5173' || port === '4173') return false;
  // Capacitor Android/iOS WebView: https://localhost or http://localhost (no port)
  return port === '';
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

/**
 * Absolute API origin for Capacitor / native WebView.
 * Empty string in normal browser (same-origin or Vite proxy).
 */
function resolveNativeApiOrigin() {
  const useProduction = import.meta.env?.VITE_CAPACITOR_USE_PRODUCTION === 'true';
  if (useProduction) return DEFAULT_PRODUCTION_API_ORIGIN;

  const platform = getCapacitorPlatform();
  const lanUrl = stripTrailingSlash(
    import.meta.env?.VITE_LAN_API_URL
    || import.meta.env?.VITE_IOS_API_URL
    || import.meta.env?.VITE_NATIVE_API_URL
    || '',
  );

  if (platform === 'ios') {
    return lanUrl || DEFAULT_PRODUCTION_API_ORIGIN;
  }
  if (platform === 'android') {
    return lanUrl || DEFAULT_CAPACITOR_NATIVE_API_ORIGIN;
  }
  return lanUrl || DEFAULT_CAPACITOR_NATIVE_API_ORIGIN;
}

/**
 * True when API requests go to a different origin than the page (split deploy or native app).
 */
export function usesRemoteApiOrigin() {
  const base = getApiBase();
  if (!base || typeof window === 'undefined') return false;
  try {
    return new URL(base).origin !== window.location.origin;
  } catch {
    return true;
  }
}

export function getApiBase() {
  if (ENV_API_BASE) return ENV_API_BASE;

  if (isCapacitorWebViewHost() || requiresAbsoluteApiBase()) {
    return resolveNativeApiOrigin();
  }

  return '';
}

/** True when Vite dev server should keep relative /api paths (local proxy). */
export function isViteDevServerHost(location = typeof window !== 'undefined' ? window.location : null) {
  if (!location) return false;
  const hostname = String(location.hostname || '').toLowerCase();
  const port = String(location.port || '');
  return (hostname === 'localhost' || hostname === '127.0.0.1')
    && (port === '5173' || port === '4173');
}

/**
 * Browser page origin for same-origin API calls (Vercel /api rewrite → Render).
 * Prefer this over hardcoded production URLs so preview domains work.
 */
export function getBrowserApiOrigin() {
  if (typeof window === 'undefined' || !window.location?.origin) return '';
  return stripTrailingSlash(window.location.origin);
}

/** Public site origin for OAuth redirects (Firebase authorized domains). */
export function getPublicAppOrigin() {
  const configured = stripTrailingSlash(import.meta.env?.VITE_PUBLIC_APP_URL || '');
  if (configured) return configured;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
}

/** Alias requested for auth / API clients */
export function getAPIBaseURL() {
  return getApiBase();
}

export const API_BASE_URL = getAPIBaseURL;

export function resolveApiUrl(path) {
  if (!path) return getApiBase() || '/';

  if (/^https?:\/\//i.test(path)) {
    if (requiresAbsoluteApiBase() && /^https?:\/\/localhost(?::\d+)?\//i.test(path)) {
      try {
        const parsed = new URL(path);
        if (parsed.pathname.startsWith('/api') || parsed.pathname.startsWith('/auth')) {
          const base = getApiBase();
          if (!base) throw new Error('API base URL is not configured for the native app.');
          return `${base}${parsed.pathname}${parsed.search}`;
        }
      } catch {
        return path;
      }
    }
    return path;
  }

  const normalized = path.startsWith('/') ? path : `/${path}`;

  const needsAbsolute =
    requiresAbsoluteApiBase()
    || isCapacitorWebViewHost()
    || (normalized.startsWith('/api') && typeof window !== 'undefined' && window.location.hostname === 'localhost' && !['5173', '4173'].includes(window.location.port));

  if (needsAbsolute) {
    const base = getApiBase() || DEFAULT_CAPACITOR_NATIVE_API_ORIGIN;
    return `${base}${normalized}`;
  }

  const remoteBase = getApiBase();
  if (remoteBase) {
    return `${remoteBase}${normalized}`;
  }

  if (isViteDevServerHost()) {
    return normalized;
  }

  const sameOrigin = getBrowserApiOrigin();
  if (sameOrigin) {
    return `${sameOrigin}${normalized}`;
  }

  if (ENV_REMOTE_API_FALLBACK) {
    return `${ENV_REMOTE_API_FALLBACK}${normalized}`;
  }

  return normalized;
}

export function nativeClientHeaders() {
  if (isCapacitorNative()) {
    return { 'X-AllModelAI-Client': 'capacitor' };
  }
  if (requiresAbsoluteApiBase() || usesRemoteApiOrigin()) {
    return { 'X-AllModelAI-Client': 'web' };
  }
  return {};
}
