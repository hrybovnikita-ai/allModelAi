import { parseJsonResponse } from './httpJson.js';

const HISTORY_FETCH_OPTS = { skipAuthRedirect: true };

function historyListUrl({ temporary = false, scope = 'active' } = {}) {
  const params = new URLSearchParams();
  if (temporary) {
    params.set('temporary', 'true');
  } else if (scope && scope !== 'active') {
    params.set('scope', scope);
  }
  const query = params.toString();
  return query ? `/api/chat/history?${query}` : '/api/chat/history';
}

/**
 * @returns {Promise<{ ok: true, conversations: object[] } | { ok: false, status: number, message: string }>}
 */
export async function fetchChatHistoryList(apiFetch, { temporary = false, scope = 'active' } = {}) {
  const response = await apiFetch(historyListUrl({ temporary, scope }), HISTORY_FETCH_OPTS);
  if (!response.ok) {
    const data = await parseJsonResponse(response).catch(() => ({}));
    return {
      ok: false,
      status: response.status,
      message: data.message || data.code || `Could not load chat history (${response.status}).`,
    };
  }
  const conversations = await response.json().catch(() => null);
  if (!Array.isArray(conversations)) {
    return {
      ok: false,
      status: response.status,
      message: 'Chat history response was invalid. Please refresh the page.',
    };
  }
  return { ok: true, conversations };
}

/**
 * @returns {Promise<{ ok: true, conversation: object } | { ok: false, status: number, message: string }>}
 */
export async function fetchChatConversation(apiFetch, conversationId) {
  if (!conversationId) {
    return { ok: false, status: 400, message: 'Missing conversation id.' };
  }
  const response = await apiFetch(`/api/chat/history/${encodeURIComponent(conversationId)}`, HISTORY_FETCH_OPTS);
  if (!response.ok) {
    const data = await parseJsonResponse(response).catch(() => ({}));
    return {
      ok: false,
      status: response.status,
      message: data.message || `Could not open conversation (${response.status}).`,
    };
  }
  const conversation = await response.json().catch(() => null);
  if (!conversation?.id) {
    return { ok: false, status: 500, message: 'Conversation payload was invalid.' };
  }
  return { ok: true, conversation };
}

export async function setConversationLifecycle(apiFetch, conversationId, lifecycleStatus) {
  const response = await apiFetch(`/api/chat/history/${encodeURIComponent(conversationId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lifecycleStatus }),
    skipAuthRedirect: true,
  });
  if (!response.ok) {
    const data = await parseJsonResponse(response).catch(() => ({}));
    throw new Error(data.message || 'Could not update conversation.');
  }
  return response.json().catch(() => ({}));
}
