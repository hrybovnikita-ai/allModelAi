import { apiFetch, checkChatResponse } from './api.js';

export async function workspaceRequest(type, { method = 'GET', id, data, signal } = {}) {
  const response = await apiFetch(id ? `/api/workspace/${encodeURIComponent(id)}` : `/api/workspace?type=${encodeURIComponent(type)}`, {
    method, signal, headers: { 'Content-Type': 'application/json' },
    ...(data ? { body: JSON.stringify({ ...data, type }) } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || 'Could not save or load your workspace.');
  return result;
}

// Consume fragmented SSE records, including failures sent after HTTP headers.
export async function readAnswer(response, onText = () => {}) {
  await checkChatResponse(response);
  if (!response.body) throw new Error('The AI returned no response stream.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', answer = '', completed = false;
  const consume = (record) => {
    const payload = record.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!payload) return;
    if (payload === '[DONE]') { completed = true; return; }
    const event = JSON.parse(payload);
    if (event.error) throw new Error(event.error);
    if (event.text) { answer += event.text; onText(answer); }
  };
  try {
    while (!completed) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      buffer = buffer.replace(/\r\n/g, '\n');
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        consume(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
      }
      if (done) { if (buffer.trim()) consume(buffer); break; }
    }
    if (!completed) throw new Error('The response was interrupted. Please retry.');
    if (!answer.trim()) throw new Error('The model returned an empty answer.');
    return answer;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function askAI({ prompt, model = 'gemini', instructions = '', signal, onText, messages = [] }) {
  if (!prompt.trim()) throw new Error('Enter a prompt first.');
  if (prompt.length > 8000) throw new Error('Shorten the prompt to 8,000 characters.');
  const response = await apiFetch('/api/chat', {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [...messages.slice(-8), { role: 'user', content: prompt }],
      temporary: true, useKnowledge: false, fallbackEnabled: false, systemInstructions: instructions }),
  });
  return readAnswer(response, onText);
}

export function documentContext(pages, question, limit = 5500) {
  const words = question.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [];
  const chunks = pages.flatMap(page => {
    const parts = [];
    for (let offset = 0; offset < page.text.length; offset += 900) {
      const text = page.text.slice(offset, offset + 1100);
      parts.push({ page: page.page, text, score: words.reduce((sum, word) => sum + Number(text.toLowerCase().includes(word)), 0) });
    }
    return parts;
  }).sort((a, b) => b.score - a.score);
  const selected = [];
  let length = 0;
  for (const chunk of chunks) {
    const excerpt = `[Page ${chunk.page}]\n${chunk.text}`;
    const size = excerpt.length + (selected.length ? 2 : 0);
    if (length + size > limit) continue;
    selected.push({ ...chunk, excerpt }); length += size;
  }
  return { text: selected.map(item => item.excerpt).join('\n\n'), sources: selected };
}

export function parseLesson(text) {
  const value = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  if (!value || typeof value.explanation !== 'string' || !value.explanation.trim() || !Array.isArray(value.cards) || !value.cards.length || !Array.isArray(value.quiz) || !value.quiz.length
    || value.cards.some(card => typeof card?.front !== 'string' || typeof card?.back !== 'string')
    || value.quiz.some(q => typeof q?.question !== 'string' || !Array.isArray(q.options) || q.options.length < 2 || q.options.some(o => typeof o !== 'string') || !Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length)) {
    throw new Error('The model returned an invalid lesson. Please generate it again.');
  }
  return value;
}

export async function runWorkflow({ input, steps, model, signal, onStep = () => {}, ask = askAI }) {
  let output = input;
  for (let index = 0; index < steps.length; index++) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (output.length > 7000) throw new Error(`Step ${index + 1} input is too long. Shorten the previous result to 7,000 characters.`);
    onStep(index, 'running');
    output = await ask({ model, prompt: output, instructions: steps[index], signal });
    onStep(index, 'done', output);
  }
  return output;
}
