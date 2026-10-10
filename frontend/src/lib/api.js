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
  let message = data.message;
  if (!message) {
    if (data.code === 'VISION_NOT_CONFIGURED') message = 'Image analysis is not configured on the server (vision API keys missing).';
    else if (data.code === 'VISION_UNSUPPORTED_MODEL') message = 'The selected model cannot analyze images. Use Smart Router, Gemini, or GPT.';
    else if (data.code === 'VISION_IMAGE_TOO_LARGE') message = 'Image is too large for analysis. Use a smaller screenshot.';
    else if (data.code === 'CHAT_INTERNAL_ERROR') {
      message = data.message || 'The chat server hit an unexpected error. Please retry in a moment.';
    }
    else if (data.code === 'PAYLOAD_TOO_LARGE') message = 'The upload is too large for the server. Use a smaller screenshot.';
    else if (data.code === 'VISION_INVALID_IMAGE' || data.code === 'VISION_UNSUPPORTED_FORMAT') message = 'Invalid or unsupported image format.';
    else if (response.status === 402) message = 'Insufficient credits or quota for this request.';
    else if (response.status === 413) message = 'Request payload too large (often an oversized image). Try a smaller screenshot.';
    else if (response.status === 429) message = 'The server is rate-limiting requests. Wait a moment and try again.';
    else if (response.status === 504) message = 'The AI server took too long to respond. Try again with a shorter prompt.';
    else if (response.status >= 500) message = `AI server error (${response.status}). Try again in a moment.`;
    else if (response.status === 404) message = 'The requested API endpoint was not found. Check that the backend is up to date.';
    else if (response.status >= 400) message = `Request failed (${response.status}).`;
    else message = 'Could not connect to the AI server. Please try again.';
  }
  const error = new Error(sessionExpired
    ? 'Your session has expired. Sign in below, then retry your message. Your conversation is still open.'
    : response.status === 401 && !sessionExpired
      ? 'Your session is active, but the request was rejected. Please retry your message.'
      : message);
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
