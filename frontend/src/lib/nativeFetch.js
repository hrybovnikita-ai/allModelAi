import {
  coerceApiUrlToSameOrigin,
  getApiBase,
  isAllModelAiBackendRequestUrl,
  isCapacitorWebViewHost,
  isExternalAuthProviderUrl,
  nativeClientHeaders,
  prefersSameOriginApi,
  requiresAbsoluteApiBase,
  resolveApiUrl,
} from './apiBase.js';
import { nativeSessionHeaders } from './nativeSession.js';
import { firebaseSessionFallbackHeaders } from './firebaseSessionFallback.js';

function resolveFetchUrl(input) {
  if (typeof input === 'string') return input;
  if (input instanceof Request) return input.url;
  return '';
}

function rewriteBackendRequestUrl(input) {
  if (typeof input !== 'string') return input;

  const coerced = coerceApiUrlToSameOrigin(input);
  if (coerced !== input) return coerced;

  if (input.startsWith('/api')) {
    return resolveApiUrl(input);
  }

  if (/^https?:\/\/localhost(?::\d+)?\//i.test(input)) {
    try {
      const parsed = new URL(input);
      if (parsed.pathname.startsWith('/api')) {
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

function shouldInterceptBackendFetch(url) {
  if (!url) return false;
  if (isExternalAuthProviderUrl(url)) return false;
  return isAllModelAiBackendRequestUrl(url);
}

function patchFetch() {
  if (typeof window === 'undefined' || window.__allmodelaiFetchPatched) return;
  if (!shouldPatchFetch()) return;

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const urlString = resolveFetchUrl(input);
    if (!shouldInterceptBackendFetch(urlString)) {
      return originalFetch(input, init);
    }

    const headers = new Headers(init.headers || {});
    Object.entries({
      ...nativeClientHeaders(),
      ...nativeSessionHeaders(),
      ...firebaseSessionFallbackHeaders(),
    }).forEach(([key, value]) => {
      headers.set(key, value);
    });
    const nextInit = {
      ...init,
      credentials: init.credentials ?? 'include',
      headers,
    };

    if (typeof input === 'string') {
      return originalFetch(rewriteBackendRequestUrl(input), nextInit);
    }

    if (input instanceof Request) {
      const rewritten = rewriteBackendRequestUrl(input.url);
      if (rewritten !== input.url) {
        return originalFetch(new Request(rewritten, input), nextInit);
      }
      return originalFetch(input, nextInit);
    }

    return originalFetch(input, nextInit);
  };

  window.__allmodelaiFetchPatched = true;
  window.__ALLMODELAI_API_BASE__ = getApiBase();
}

/**
 * Ensures auth/API calls never stay on https://localhost in Capacitor WebView.
 * Does not modify Firebase or Google provider fetch calls.
 */
export function installNativeFetchInterceptor() {
  patchFetch();
  if (window.__allmodelaiFetchPatched) return;

  queueMicrotask(patchFetch);
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', patchFetch, { once: true });
  }
}
