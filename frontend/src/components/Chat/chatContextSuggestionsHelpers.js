export function parseSuggestionsContextKey(key) {
  const raw = String(key || '').trim();
  if (raw.startsWith('draft::')) return raw.slice(7);
  if (raw.startsWith('history::')) return raw.split('::').slice(2).join('::');
  return '';
}

export function buildSuggestionsContextKey({ prompt, messages, activeConversationId, selectedSkill }) {
  if (selectedSkill === 'video' || selectedSkill === 'image' || selectedSkill === 'file') return '';
  const draft = String(prompt).trim();
  if (draft.length >= 12) return `draft::${draft}`;
  const lastUser = [...messages].reverse().find((message) => message.role === 'user');
  const historyText = String(lastUser?.content ?? lastUser?.text ?? '').trim();
  if (historyText.length >= 12) {
    return `history::${activeConversationId || 'new'}::${historyText}`;
  }
  return '';
}
