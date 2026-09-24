import { restoreSession } from './session.js';
import { isLoggerEnabled, logger } from './logger.js';

const apiPath = (url) => {
  try {
    const parsed = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    return `${parsed.pathname}${parsed.search ? '?…' : ''}`;
  } catch {
    return String(url).split('?')[0];
  }
};

export function apiFetch(url, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const path = apiPath(url);
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();

  if (isLoggerEnabled()) {
    logger.api(`${method} ${path}`, { status: 'started' });
  }

  return fetch(url, { ...options, credentials: 'include' })
    .then((response) => {
      if (isLoggerEnabled()) {
        const durationMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - started);
        logger.api(`Response received`, {
          method,
          path,
          status: response.status,
          durationMs,
        });
        if (!response.ok) {
          logger.apiError(`${method} ${path}`, {
            status: response.status,
            statusText: response.statusText,
          });
        }
      }
      return response;
    })
    .catch((error) => {
      const durationMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - started);
      logger.apiError(`${method} ${path}`, {
        message: error?.message || 'Network request failed',
        durationMs,
      });
      throw error;
    });
}

export async function checkChatResponse(response) {
  if (response.ok) return response;
  const data = await response.json().catch(() => ({}));
  let sessionExpired = false;
  if (response.status === 401) {
    sessionExpired = (await restoreSession({ force: true })) === null;
  }
  const error = new Error(sessionExpired
    ? 'Your session has expired. Sign in below, then retry your message. Your conversation is still open.'
    : response.status === 401
      ? 'Your session is active, but the request was rejected. Please retry your message.'
      : data.message || 'Could not connect to the AI server. Please try again.');
  error.status = response.status;
  error.sessionExpired = sessionExpired;
  if (isLoggerEnabled()) {
    logger.apiError('Chat request failed', {
      status: response.status,
      message: data.message || error.message,
      sessionExpired,
    });
  }
  throw error;
}
