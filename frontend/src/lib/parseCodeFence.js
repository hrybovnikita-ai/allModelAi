/** Parse ```lang:path/to/file.py fence headers. */
export function parseFenceHeader(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return { language: 'text', filename: null };
  const match = trimmed.match(/^([\w.+#-]+)(?::(.+))?$/);
  if (!match) return { language: trimmed, filename: null };
  const language = match[1];
  const filename = match[2]?.trim().replace(/\\/g, '/').split('/').pop() || null;
  const safeName = filename
    ? filename.replace(/[<>:"|?*]/g, '_').replace(/[^\w.\-+/]/g, '_').slice(0, 120)
    : null;
  return { language, filename: safeName };
}

export function defaultFilenameForLanguage(language) {
  const map = {
    javascript: 'script.js',
    typescript: 'index.ts',
    python: 'main.py',
    jsx: 'App.jsx',
    tsx: 'App.tsx',
    html: 'index.html',
    css: 'styles.css',
    json: 'data.json',
    markdown: 'README.md',
    bash: 'run.sh',
  };
  const key = String(language || '').toLowerCase();
  return map[key] || `snippet.${key === 'text' ? 'txt' : key}`;
}
