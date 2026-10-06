import {
  coerceApiUrlToSameOrigin,
  DEFAULT_CAPACITOR_NATIVE_API_ORIGIN,
  getApiBase,
  isCapacitorWebViewHost,
  nativeClientHeaders,
  prefersSameOriginApi,
  requiresAbsoluteApiBase,
  resolveApiUrl,
} from './apiBase.js';
import { postJson } from './httpJson.js';
import { nativeSessionHeaders } from './nativeSession.js';

function normalizeAuthPath(path) {
  if (!path) return '/api/auth/session';
  if (path.startsWith('/api/')) return path;
  const slug = String(path).replace(/^\//, '');
  if (slug === 'signin' || slug === 'sign-in') return '/api/auth/login';
  return `/api/auth/${slug}`;
}

/**
 * Auth URLs must never stay relative on https://localhost (Capacitor WebView).
 */
export function resolveAuthApiUrl(path) {
  const normalized = normalizeAuthPath(path);
  let url = coerceApiUrlToSameOrigin(resolveApiUrl(normalized));

  if (prefersSameOriginApi() && url.startsWith('/api')) {
    return url;
  }

  const needsRewrite =
    url.startsWith('/api')
    || /^https?:\/\/localhost(?::\d+)?\//i.test(url);

  if (needsRewrite && (requiresAbsoluteApiBase() || isCapacitorWebViewHost())) {
    const base = getApiBase() || DEFAULT_CAPACITOR_NATIVE_API_ORIGIN;
    if (url.startsWith('/api')) {
      return `${base}${url}`;
    }
    try {
      const parsed = new URL(url);
      return `${base}${parsed.pathname}${parsed.search}`;
    } catch {
      return `${base}${normalized}`;
    }
  }

  return url;
}

export async function authPost(path, body, options) {
  const url = resolveAuthApiUrl(path);
  return postJson(url, body, options);
}

export async function authGet(path, options = {}) {
  const url = resolveAuthApiUrl(path);
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...nativeClientHeaders(),
      ...nativeSessionHeaders(),
      ...(options.headers || {}),
    },
    ...options,
  });
  return response;
}
