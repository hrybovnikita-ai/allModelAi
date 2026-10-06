import {
  coerceApiUrlToSameOrigin,
  getApiBase,
  isCapacitorWebViewHost,
  nativeClientHeaders,
  prefersSameOriginApi,
  requiresAbsoluteApiBase,
  resolveApiUrl,
} from './apiBase.js';
import { nativeSessionHeaders } from './nativeSession.js';

function isApiLikePath(pathname) {
  return pathname.startsWith('/api') || pathname.startsWith('/auth');
}

function rewriteRequestUrl(input) {
  if (typeof input !== 'string') return input;

  const coerced = coerceApiUrlToSameOrigin(input);
  if (coerced !== input) return coerced;

  if (input.startsWith('/') && isApiLikePath(input)) {
    return resolveApiUrl(input);
  }

  if (/^https?:\/\/localhost(?::\d+)?\//i.test(input)) {
    try {
      const parsed = new URL(input);
      if (isApiLikePath(parsed.pathname)) {
        return resolveApiUrl(`${parsed.pathname}${parsed.search}`);
      }
    } catch {
      return input;
    }
  }

  return input;
}

function shouldPatchFetch() {
  if (import.meta.env?.VITE_CAPACITOR_NATIVE === 'true') return true;
  if (typeof window !== 'undefined' && isCapacitorWebViewHost()) return true;
  if (typeof window !== 'undefined' && prefersSameOriginApi()) return true;
  return requiresAbsoluteApiBase();
}

function patchFetch() {
  if (typeof window === 'undefined' || window.__allmodelaiFetchPatched) return;
  if (!shouldPatchFetch()) return;

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const headers = new Headers(init.headers || {});
    Object.entries({ ...nativeClientHeaders(), ...nativeSessionHeaders() }).forEach(([key, value]) => {
      headers.set(key, value);
    });
    const nextInit = {
      ...init,
      credentials: init.credentials ?? 'include',
      headers,
    };

    if (typeof input === 'string') {
      return originalFetch(rewriteRequestUrl(input), nextInit);
    }

    if (input instanceof Request) {
      const rewritten = rewriteRequestUrl(input.url);
      if (rewritten !== input.url) {
        return originalFetch(new Request(rewritten, input), nextInit);
      }
    }

    return originalFetch(input, nextInit);
  };

  window.__allmodelaiFetchPatched = true;
  window.__ALLMODELAI_API_BASE__ = getApiBase();
}

/**
 * Ensures auth/API calls never stay on https://localhost in Capacitor WebView.
 */
export function installNativeFetchInterceptor() {
  patchFetch();
  if (window.__allmodelaiFetchPatched) return;

  queueMicrotask(patchFetch);
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', patchFetch, { once: true });
  }
}
