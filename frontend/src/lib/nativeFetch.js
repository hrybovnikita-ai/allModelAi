import {
  getApiBase,
  isCapacitorWebViewHost,
  nativeClientHeaders,
  requiresAbsoluteApiBase,
  resolveApiUrl,
} from './apiBase.js';

function isApiLikePath(pathname) {
  return pathname.startsWith('/api') || pathname.startsWith('/auth');
}

function rewriteRequestUrl(input) {
  if (typeof input !== 'string') return input;

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
  return requiresAbsoluteApiBase();
}

function patchFetch() {
  if (typeof window === 'undefined' || window.__allmodelaiFetchPatched) return;
  if (!shouldPatchFetch()) return;

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const headers = new Headers(init.headers || {});
    Object.entries(nativeClientHeaders()).forEach(([key, value]) => headers.set(key, value));

    if (typeof input === 'string') {
      return originalFetch(rewriteRequestUrl(input), { ...init, headers });
    }

    if (input instanceof Request) {
      const rewritten = rewriteRequestUrl(input.url);
      if (rewritten !== input.url) {
        return originalFetch(new Request(rewritten, input), { ...init, headers });
      }
    }

    return originalFetch(input, { ...init, headers });
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
