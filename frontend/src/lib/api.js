export function apiFetch(url, options = {}) {
  return fetch(url, { credentials: 'include', ...options });
}

export async function checkChatResponse(response) {
  if (response.ok) return response;
  const data = await response.json().catch(() => ({}));
  const error = new Error(response.status === 401
    ? 'Your session has expired. Sign in below, then retry your message. Your conversation is still open.'
    : data.message || 'Could not connect to the AI server. Please try again.');
  error.status = response.status;
  throw error;
}
