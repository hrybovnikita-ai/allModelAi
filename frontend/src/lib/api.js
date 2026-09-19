import { restoreSession } from './session.js';

export function apiFetch(url, options = {}) {
  return fetch(url, { ...options, credentials: 'include' });
}

export async function checkChatResponse(response) {
  if (response.ok) return response;
  const data = await response.json().catch(() => ({}));
  let sessionExpired = false;
  if (response.status === 401) {
    // Provider failures and deployment outages must not become a login prompt.
    sessionExpired = (await restoreSession({ force: true })) === null;
  }
  const error = new Error(sessionExpired
    ? 'Your session has expired. Sign in below, then retry your message. Your conversation is still open.'
    : response.status === 401
      ? 'Your session is active, but the request was rejected. Please retry your message.'
      : data.message || 'Could not connect to the AI server. Please try again.');
  error.status = response.status;
  error.sessionExpired = sessionExpired;
  throw error;
}
