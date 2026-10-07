export function conversationDisplayTitle(conversation, previewFn) {
  const title = String(conversation?.title || '').trim();
  if (title) return title;
  return previewFn(conversation);
}

export function conversationSecondaryLabel(conversation) {
  const hasDeepResearch = conversation?.messages?.some((message) => message.deepResearch);
  if (hasDeepResearch) return 'Deep Research';
  return '';
}

export function getConversationTimestamp(conversation) {
  const raw = conversation?.updatedAt || conversation?.createdAt || '';
  const time = Date.parse(raw);
  return Number.isFinite(time) ? time : 0;
}

function startOfLocalDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function formatConversationTime(timestampMs) {
  if (!timestampMs) return '';
  const now = Date.now();
  const diffMs = now - timestampMs;
  const dayMs = 86400000;
  if (diffMs < dayMs && startOfLocalDay(now) === startOfLocalDay(timestampMs)) return 'Today';
  if (diffMs < dayMs * 2 && startOfLocalDay(now - dayMs) === startOfLocalDay(timestampMs)) return 'Yesterday';
  if (diffMs < dayMs * 7) return `${Math.max(1, Math.floor(diffMs / dayMs))}d`;
  return new Date(timestampMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function groupConversationsByDate(conversations, chatMeta = {}) {
  const pinned = [];
  const unpinned = [];
  conversations.forEach((conversation) => {
    if (chatMeta[conversation.id]?.pinned) pinned.push(conversation);
    else unpinned.push(conversation);
  });

  pinned.sort((a, b) => getConversationTimestamp(b) - getConversationTimestamp(a));
  unpinned.sort((a, b) => getConversationTimestamp(b) - getConversationTimestamp(a));

  const now = Date.now();
  const todayStart = startOfLocalDay(now);
  const yesterdayStart = todayStart - 86400000;
  const weekStart = todayStart - 86400000 * 7;
  const monthStart = todayStart - 86400000 * 30;

  const groups = [
    { id: 'today', label: 'Today', items: [] },
    { id: 'yesterday', label: 'Yesterday', items: [] },
    { id: 'week', label: 'Previous 7 days', items: [] },
    { id: 'month', label: 'Previous 30 days', items: [] },
    { id: 'older', label: 'Older', items: [] },
  ];

  unpinned.forEach((conversation) => {
    const ts = getConversationTimestamp(conversation);
    const day = startOfLocalDay(ts || now);
    if (day >= todayStart) groups[0].items.push(conversation);
    else if (day >= yesterdayStart) groups[1].items.push(conversation);
    else if (day >= weekStart) groups[2].items.push(conversation);
    else if (day >= monthStart) groups[3].items.push(conversation);
    else groups[4].items.push(conversation);
  });

  return {
    pinned,
    groups: groups.filter((group) => group.items.length > 0),
  };
}
