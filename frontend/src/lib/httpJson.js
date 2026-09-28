import { nativeClientHeaders, resolveApiUrl } from './apiBase.js';

export {
  getApiBase,
  isCapacitorNative,
  isCapacitorWebViewHost,
  requiresAbsoluteApiBase,
  resolveApiUrl,
} from './apiBase.js';

function looksLikeHtml(text) {
  const trimmed = text.trimStart().toLowerCase();
  return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html');
}

export function apiResponseError(response, data, { html = false } = {}) {
  if (html) {
    if (response.status === 404) {
      return 'Authentication API was not found. For Android, set VITE_API_BASE_URL or use production build defaults.';
    }
    return 'The server returned a web page instead of API data. Check VITE_API_BASE_URL and that the backend is reachable.';
  }
  return data?.message || `Request failed (${response.status})`;
}

/**
 * @returns {Promise<{ data: unknown, parseError: Error | null, html: boolean }>}
 */
export async function readJsonBody(response) {
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();

  if (!text) {
    return { data: null, parseError: null, html: false };
  }

  const jsonLike =
    contentType.includes('application/json') ||
    contentType.includes('+json') ||
    text.trimStart().startsWith('{') ||
    text.trimStart().startsWith('[');

  if (!jsonLike && looksLikeHtml(text)) {
    return {
      data: null,
      parseError: new Error(apiResponseError(response, null, { html: true })),
      html: true,
    };
  }

  try {
    return { data: JSON.parse(text), parseError: null, html: false };
  } catch {
    return {
      data: null,
      parseError: new Error('The server returned an invalid response. Please try again.'),
      html: false,
    };
  }
}

export async function parseJsonResponse(response) {
  const { data, parseError } = await readJsonBody(response);
  if (parseError) throw parseError;
  return data ?? {};
}

export async function postJson(path, body, options = {}) {
  const url = resolveApiUrl(path);
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...nativeClientHeaders(),
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });
  } catch (networkError) {
    throw new Error(
      networkError?.message?.includes('Failed to fetch')
        ? 'Could not reach the server. Check your network or VITE_API_BASE_URL for the Android app.'
        : networkError?.message || 'Network request failed.',
    );
  }

  const { data, parseError, html } = await readJsonBody(response);
  if (parseError) throw parseError;

  if (!response.ok) {
    const error = new Error(apiResponseError(response, data, { html }));
    error.status = response.status;
    error.code = data?.code;
    error.data = data;
    throw error;
  }

  return { response, data };
}
