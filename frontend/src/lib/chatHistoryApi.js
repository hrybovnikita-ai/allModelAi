import { parseJsonResponse } from './httpJson.js';

const HISTORY_FETCH_OPTS = { skipAuthRedirect: true };
const LIST_CACHE_TTL_MS = 8000;

/** @type {Map<string, { expiresAt: number, conversations: object[] }>} */
const listCache = new Map();
/** @type {Map<string, Promise<{ ok: boolean, conversations?: object[], status?: number, message?: string }>>} */
const listInflight = new Map();

function historyListUrl({ temporary = false, scope = 'active', limit, offset } = {}) {
  const params = new URLSearchParams();
  if (temporary) {
    params.set('temporary', 'true');
  } else if (scope && scope !== 'active') {
    params.set('scope', scope);
  }
  if (Number.isFinite(limit) && limit > 0) {
    params.set('limit', String(Math.floor(limit)));
  }
  if (Number.isFinite(offset) && offset > 0) {
    params.set('offset', String(Math.floor(offset)));
  }
  const query = params.toString();
  return query ? `/api/chat/history?${query}` : '/api/chat/history';
}

function cacheKeyForUrl(url) {
  return url;
}

/**
 * @returns {Promise<{ ok: true, conversations: object[] } | { ok: false, status: number, message: string }>}
 */
export async function fetchChatHistoryList(
  apiFetch,
  { temporary = false, scope = 'active', limit, offset } = {},
  { signal, force = false } = {},
) {
  const url = historyListUrl({ temporary, scope, limit, offset });
  const cacheKey = cacheKeyForUrl(url);
  const now = Date.now();
  if (!force) {
    const cached = listCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return { ok: true, conversations: cached.conversations };
    }
    const inflight = listInflight.get(cacheKey);
    if (inflight) return inflight;
  }

  const run = (async () => {
    const response = await apiFetch(url, { ...HISTORY_FETCH_OPTS, signal });
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
    listCache.set(cacheKey, { expiresAt: Date.now() + LIST_CACHE_TTL_MS, conversations });
    return { ok: true, conversations };
  })();

  listInflight.set(cacheKey, run);
  try {
    return await run;
  } finally {
    if (listInflight.get(cacheKey) === run) {
      listInflight.delete(cacheKey);
    }
  }
}

export function invalidateChatHistoryListCache() {
  listCache.clear();
}

/**
 * @returns {Promise<{ ok: true, conversation: object } | { ok: false, status: number, message: string }>}
 */
export async function fetchChatConversation(apiFetch, conversationId, { signal } = {}) {
  if (!conversationId) {
    return { ok: false, status: 400, message: 'Missing conversation id.' };
  }
  const response = await apiFetch(`/api/chat/history/${encodeURIComponent(conversationId)}`, {
    ...HISTORY_FETCH_OPTS,
    signal,
  });
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
  invalidateChatHistoryListCache();
  return response.json().catch(() => ({}));
}
