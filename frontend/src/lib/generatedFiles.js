const extensions = new Set(['txt', 'md', 'html', 'css', 'js', 'jsx', 'ts', 'tsx', 'py', 'json', 'csv', 'xml', 'yaml', 'yml', 'sql', 'sh', 'java', 'c', 'cpp', 'h', 'rs', 'go', 'svg']);

export function parseGeneratedFile(text) {
  if (typeof text !== 'string') return null;
  let source = text.trim();
  const fenced = source.match(/^```(?:json|allmodelai-file)?\s*\n([\s\S]*?)\n```$/);
  if (fenced) source = fenced[1];
  try {
    const value = JSON.parse(source);
    if (value?.type !== 'allmodelai-file' || typeof value.name !== 'string' || typeof value.content !== 'string' || !value.content.trim()) return null;
    const name = value.name.split(/[\\/]/).pop().replace(/[<>:"|?*]/g, '_').split('').map(character => character.charCodeAt(0) < 32 ? '_' : character).join('').trim().slice(0, 120);
    const extension = name.split('.').pop().toLowerCase();
    if (!name || !extensions.has(extension)) return null;
    const title = typeof value.title === 'string' && value.title.trim() ? value.title.trim().slice(0, 200) : name;
    // Stable URL identity across history normalization and reloads, not a security token.
    let hash = 2166136261;
    for (const character of name + '\0' + value.content) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    return { name, title, content: value.content, extension, id: (hash >>> 0).toString(36) };
  } catch { return null; }
}

export function findGeneratedFile(conversation, id) {
  for (const message of conversation?.messages || []) {
    if (message.role !== 'assistant') continue;
    const file = parseGeneratedFile(message.content ?? message.text);
    if (file?.id === id) return file;
  }
  return null;
}
