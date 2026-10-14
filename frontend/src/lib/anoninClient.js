import { apiFetch } from './api';
export { normalizeAnoninModelSlug, isAnoninModelSlug, ANONIN_MODEL_SLUG } from './anoninModelSlug.js';

export async function revealAnoninMessage({ messageId, conversationId }) {
  const res = await apiFetch('/api/chat/anonin/reveal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId, conversationId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || 'Could not reveal model');
    err.code = data.code;
    throw err;
  }
  return data;
}

async function fetchRevealedIdsForAlias(conversationId, alias) {
  const res = await apiFetch(`/api/chat/${alias}/revealed/${encodeURIComponent(conversationId)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, messageIds: [] };
  return {
    ok: true,
    status: res.status,
    messageIds: Array.isArray(data.messageIds) ? data.messageIds : [],
  };
}

export async function fetchAnoninRevealedIds(conversationId) {
  if (!conversationId) return [];
  for (const alias of ['anonin', 'anonymous', 'anonim']) {
    const result = await fetchRevealedIdsForAlias(conversationId, alias);
    if (result.ok) return result.messageIds;
    if (result.status !== 404) return [];
  }
  return [];
}
