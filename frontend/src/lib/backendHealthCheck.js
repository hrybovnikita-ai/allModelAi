import { getApiBase, nativeClientHeaders, resolveApiUrl } from './apiBase.js';

const BACKEND_READY_EVENT = 'allmodelai:backend-ready';
const BACKEND_OFFLINE_EVENT = 'allmodelai:backend-offline';

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Ping GET /api/status/models with retries (Electron / native cold-start on Render).
 */
export async function pingBackendHealth({
  attempts = 5,
  intervalMs = 2000,
  signal,
} = {}) {
  const url = resolveApiUrl('/api/status/models');
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (signal?.aborted) {
      return { ok: false, url, error: 'aborted', attempts: attempt - 1 };
    }
    try {
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          ...nativeClientHeaders(),
        },
        signal,
      });
      if (response.ok) {
        return { ok: true, url, attempts: attempt };
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) {
      await sleep(intervalMs);
    }
  }

  return { ok: false, url, error: lastError, attempts };
}

export function startBackendHealthCheck(options = {}) {
  const controller = new AbortController();
  void pingBackendHealth({ ...options, signal: controller.signal }).then((result) => {
    if (typeof window === 'undefined') return;
    window.__ALLMODELAI_BACKEND_HEALTH__ = result;
    window.dispatchEvent(
      new CustomEvent(result.ok ? BACKEND_READY_EVENT : BACKEND_OFFLINE_EVENT, { detail: result }),
    );
    if (!result.ok && import.meta.env?.DEV) {
      console.warn(
        '[AllModelAI] Backend health check failed after retries.',
        { apiBase: getApiBase(), ...result },
      );
    }
  });
  return () => controller.abort();
}

export { BACKEND_READY_EVENT, BACKEND_OFFLINE_EVENT };
