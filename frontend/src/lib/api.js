import { isFreshLoginGraceActive, restoreSession } from './session.js';
import { isLoggerEnabled, logger } from './logger.js';
import { nativeClientHeaders } from './apiBase.js';
import { nativeSessionHeaders } from './nativeSession.js';
import { firebaseSessionFallbackHeaders } from './firebaseSessionFallback.js';
import { parseJsonResponse, resolveApiUrl } from './httpJson.js';

export {
  API_BASE_URL,
  getAPIBaseURL,
  getApiBase,
  isCapacitorNative,
  parseJsonResponse,
  resolveApiUrl,
} from './httpJson.js';

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

  const headers = {
    Accept: 'application/json',
    ...nativeClientHeaders(),
    ...nativeSessionHeaders(),
    ...(isFreshLoginGraceActive() ? firebaseSessionFallbackHeaders() : {}),
    ...(options.headers || {}),
  };

  const skipAuthRedirect = Boolean(options.skipAuthRedirect);
  const { skipAuthRedirect: _drop, ...fetchOptions } = options;

  return fetch(resolveApiUrl(url), { ...fetchOptions, credentials: 'include', headers })
    .then(async (response) => {
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
      if (response.status === 401 && !skipAuthRedirect) {
        const { handleUnauthorizedApiResponse } = await import('./clientAuthReset.js');
        await handleUnauthorizedApiResponse(url);
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
  const data = await parseJsonResponse(response).catch(() => ({}));
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
  if (data.code) error.code = data.code;
  if (isLoggerEnabled()) {
    logger.apiError('Chat request failed', {
      status: response.status,
      code: data.code,
      message: data.message || error.message,
      sessionExpired,
    });
  }
  throw error;
}
