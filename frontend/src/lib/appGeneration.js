import { CSS_FILE, DEFAULT_PAGE, JS_FILE, normalizeProject } from './websiteProject.js';

function assignBlock(files, tag, content) {
  const label = tag.trim().toLowerCase();
  if (label === 'html' || label === DEFAULT_PAGE) {
    files[DEFAULT_PAGE] = content;
    return;
  }
  if (label === 'css' || label === CSS_FILE) {
    files[CSS_FILE] = content;
    return;
  }
  if (label === 'javascript' || label === 'js' || label === JS_FILE) {
    files[JS_FILE] = content;
    return;
  }
  if (/^[a-z0-9][a-z0-9.-]*\.html$/.test(label)) {
    files[label] = content;
  }
}

export function extractApplication(text) {
  const files = {};
  const pattern = /```([^\n`]+)\s*\n([\s\S]*?)```/gi;
  let match = pattern.exec(text);
  while (match) {
    assignBlock(files, match[1], match[2].trim());
    match = pattern.exec(text);
  }

  const htmlPages = Object.keys(files).filter((name) => name.endsWith('.html'));
  const hasCss = Object.prototype.hasOwnProperty.call(files, CSS_FILE);
  const hasJs = Object.prototype.hasOwnProperty.call(files, JS_FILE);

  if (!htmlPages.length || !hasCss || !hasJs) {
    throw new Error('The AI returned incomplete files. Try a smaller application or generate again. Your previous files are unchanged.');
  }

  return normalizeProject(files);
}

export async function readGenerationStream(response) {
  if (!response.body) throw new Error('The AI returned no response.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let completed = false;
  const consume = (event) => {
    for (const line of event.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') { completed = true; continue; }
      const data = JSON.parse(payload);
      if (data.error) throw new Error(typeof data.error === 'string' ? data.error : 'Generation failed.');
      if (data.text) text += data.text;
    }
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      buffer = buffer.replaceAll('\r\n', '\n');
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';
      events.forEach(consume);
      if (done) {
        if (buffer.trim()) consume(buffer);
        if (!completed) throw new Error('Generation was interrupted. Please retry.');
        return text;
      }
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
