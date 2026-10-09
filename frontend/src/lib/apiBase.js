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

function isPrivateLanHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host) return false;
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return true;
  if (host.endsWith('.local')) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  return false;
}

/** True when the page is Vite (or preview) on loopback — use relative /api and the dev proxy. */
export function isBrowserLocalhostDev(location = typeof window !== 'undefined' ? window.location : null) {
  if (!location) return false;
  if (import.meta.env?.VITE_CAPACITOR_NATIVE === 'true') return false;
  const protocol = String(location.protocol || '').toLowerCase();
  const hostname = String(location.hostname || '').toLowerCase();
  if (protocol === 'capacitor:' || protocol === 'ionic:') return false;
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') return false;
  const port = String(location.port || '');
  // Capacitor WebView is https://localhost with no port; Vite always uses an explicit port.
  return port !== '';
}

export function isCapacitorWebViewHost(location = typeof window !== 'undefined' ? window.location : null) {
  if (!location) return false;
  if (isBrowserLocalhostDev(location)) return false;
  const protocol = String(location.protocol || '').toLowerCase();
  const hostname = String(location.hostname || '').toLowerCase();
  const port = String(location.port || '');

  if (protocol === 'capacitor:' || protocol === 'ionic:') return true;
  if (hostname !== 'localhost') return false;
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
 * Production SPA served from a public HTTPS host (Vercel/custom domain).
 * API calls must stay same-origin (/api → backend proxy) so Safari treats session cookies as first-party.
 */
export function isHostedWebApp(location = typeof window !== 'undefined' ? window.location : null) {
  if (!location) return false;
  if (isCapacitorNative() || isCapacitorWebViewHost(location)) return false;
  const hostname = String(location.hostname || '').toLowerCase();
  if (hostname === 'localhost' || hostname === '127.0.0.1') return false;
  return String(location.protocol || '').toLowerCase() === 'https:' || hostname.endsWith('.vercel.app');
}

export function prefersSameOriginApi() {
  return isHostedWebApp();
}

function isApiLikePathname(pathname = '') {
  return pathname.startsWith('/api') || pathname.startsWith('/auth');
}

function isBackendApiPathname(pathname = '') {
  return pathname === '/api' || pathname.startsWith('/api/');
}

const EXTERNAL_AUTH_PROVIDER_SUFFIXES = [
  'accounts.google.com',
  'googleapis.com',
  'google.com',
  'gstatic.com',
  'firebaseapp.com',
  'firebaseio.com',
  'firebase.google.com',
  'cloudfunctions.net',
];

/** Firebase / Google OAuth endpoints must never be rewritten or receive AllModelAI fetch headers. */
export function isExternalAuthProviderUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const base = typeof window !== 'undefined' ? window.location?.origin : undefined;
    const parsed = /^https?:\/\//i.test(url) ? new URL(url) : new URL(url, base || 'https://localhost');
    const host = parsed.hostname.toLowerCase();
    return EXTERNAL_AUTH_PROVIDER_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

/** True for same-origin or Render URLs that target this app's /api/* backend routes. */
export function isAllModelAiBackendRequestUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (isExternalAuthProviderUrl(url)) return false;
  try {
    const base = getBrowserApiOrigin() || (typeof window !== 'undefined' ? window.location?.origin : '');
    const parsed = /^https?:\/\//i.test(url) ? new URL(url) : new URL(url, base || 'https://localhost');
    if (!isBackendApiPathname(parsed.pathname)) return false;
    if (url.startsWith('/')) return true;
    if (base && parsed.origin === base) return true;
    if (/\.onrender\.com$/i.test(parsed.hostname)) return true;
    const envRemote = ENV_API_BASE || ENV_REMOTE_API_FALLBACK;
    if (envRemote) {
      try {
        if (parsed.origin === new URL(envRemote).origin) return true;
      } catch {
        /* ignore */
      }
    }
  } catch {
    return false;
  }
  return false;
}

/** Rewrite accidental cross-origin Render API URLs back to first-party paths on the public site. */
export function coerceApiUrlToSameOrigin(url) {
  if (!prefersSameOriginApi() || !url) return url;
  if (!/^https?:\/\//i.test(url)) return url;
  try {
    const parsed = new URL(url);
    if (!isApiLikePathname(parsed.pathname)) return url;
    const pageOrigin = getBrowserApiOrigin();
    if (pageOrigin && parsed.origin === pageOrigin) {
      return `${parsed.pathname}${parsed.search}`;
    }
    const envRemote = ENV_API_BASE || ENV_REMOTE_API_FALLBACK;
    if (envRemote) {
      const remoteOrigin = new URL(envRemote).origin;
      if (parsed.origin === remoteOrigin) {
        return `${parsed.pathname}${parsed.search}`;
      }
    }
    if (/\.onrender\.com$/i.test(parsed.hostname) && isApiLikePathname(parsed.pathname)) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    return url;
  }
  return url;
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
  if (prefersSameOriginApi()) {
    return '';
  }

  if (ENV_API_BASE) return ENV_API_BASE;

  if (isCapacitorWebViewHost() || requiresAbsoluteApiBase()) {
    return resolveNativeApiOrigin();
  }

  return '';
}

const VITE_LAN_DEV_PORTS = new Set(['5173', '5174', '4173']);

/** True when Vite dev server should keep relative /api paths (local proxy). */
export function isViteDevServerHost(location = typeof window !== 'undefined' ? window.location : null) {
  if (isBrowserLocalhostDev(location)) return true;
  if (!location) return false;
  const protocol = String(location.protocol || '').toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') return false;
  const hostname = String(location.hostname || '').toLowerCase();
  const port = String(location.port || '');
  if (!isPrivateLanHost(hostname) || !port) return false;
  return VITE_LAN_DEV_PORTS.has(port);
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
    const sameOriginPath = coerceApiUrlToSameOrigin(path);
    if (sameOriginPath !== path) {
      return sameOriginPath;
    }
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

  if (prefersSameOriginApi() && isApiLikePathname(normalized)) {
    return normalized;
  }

  const needsAbsolute =
    requiresAbsoluteApiBase()
    || (isCapacitorWebViewHost() && !isBrowserLocalhostDev());

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

  if (ENV_REMOTE_API_FALLBACK && !prefersSameOriginApi()) {
    return `${ENV_REMOTE_API_FALLBACK}${normalized}`;
  }

  return normalized;
}

export function nativeClientHeaders() {
  if (isCapacitorNative()) {
    return { 'X-AllModelAI-Client': 'capacitor' };
  }
  if (prefersSameOriginApi()) {
    return {};
  }
  if (requiresAbsoluteApiBase() || usesRemoteApiOrigin()) {
    return { 'X-AllModelAI-Client': 'web' };
  }
  return {};
}
