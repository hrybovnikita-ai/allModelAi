export function extractApplication(text) {
  const block = (names) => {
    for (const name of names) {
      const match = text.match(new RegExp('```' + name + '\\s*\\n([\\s\\S]*?)```', 'i'));
      if (match) return match[1].trim();
    }
    return null;
  };
  const files = { html: block(['html']), css: block(['css']), js: block(['javascript', 'js']) };
  if (!files.html || files.css === null || files.js === null) {
    throw new Error('The AI returned incomplete files. Try a smaller application or generate again. Your previous files are unchanged.');
  }
  return files;
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
