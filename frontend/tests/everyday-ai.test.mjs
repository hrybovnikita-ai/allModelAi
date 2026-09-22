import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

let server, lib, EverydayAI;
before(async () => {
  server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: 'custom' });
  lib = await server.ssrLoadModule('/src/lib/everydayAI.js');
  EverydayAI = (await server.ssrLoadModule('/src/components/EverydayAI/EverydayAI.jsx')).default;
});
after(async () => { await server?.close(); });

function stream(chunks) {
  return new Response(new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk)); controller.close(); } }));
}
test('assembles fragmented SSE and preserves Unicode', async () => {
  const updates = [];
  const text = await lib.readAnswer(stream(['data: {"te', 'xt":"Hello "}\r', '\n\r\ndata: {"text":"світ"}\n\ndata: [DONE]']), value => updates.push(value));
  assert.equal(text, 'Hello світ'); assert.equal(updates.length, 2);
});
test('does not accept truncated, empty, or failed provider streams as answers', async () => {
  await assert.rejects(lib.readAnswer(stream(['data: {"text":"partial"}\n\n'])), /interrupted/);
  await assert.rejects(lib.readAnswer(stream(['data: [DONE]\n\n'])), /empty answer/);
  await assert.rejects(lib.readAnswer(stream(['data: {"error":"Provider unavailable"}\n\ndata: [DONE]\n\n'])), /Provider unavailable/);
});
test('retrieves relevant page excerpts within the model context budget', () => {
  const result = lib.documentContext([{ page: 1, text: 'Unrelated introduction. '.repeat(200) }, { page: 9, text: 'The renewal deadline is 30 November.' }], 'What is the renewal deadline?', 1200);
  assert.equal(result.sources[0].page, 9); assert.match(result.text, /\[Page 9\]/); assert.ok(result.text.length <= 1200);
});
test('validates lesson structure and answer indices before rendering quizzes', () => {
  const lesson = { explanation: 'Lesson', cards: [{ front: 'Q', back: 'A' }], quiz: [{ question: 'Q', options: ['A', 'B'], answer: 0 }] };
  assert.deepEqual(lib.parseLesson('```json\n' + JSON.stringify(lesson) + '\n```'), lesson);
  lesson.quiz[0].answer = 4;
  assert.throws(() => lib.parseLesson(JSON.stringify(lesson)), /invalid lesson/);
});
test('workflows pass actual outputs to subsequent steps and stop on failure', async () => {
  const calls = [];
  const result = await lib.runWorkflow({ input: 'Original', steps: ['Summarize', 'Translate'], ask: async request => { calls.push(request); return calls.length === 1 ? 'Summary' : 'Translation'; } });
  assert.equal(result, 'Translation'); assert.equal(calls[1].prompt, 'Summary'); assert.equal(calls[1].instructions, 'Translate');
  let count = 0;
  await assert.rejects(lib.runWorkflow({ input: 'Original', steps: ['Fail', 'Never run'], ask: async () => { count++; throw new Error('Unavailable'); } }), /Unavailable/);
  assert.equal(count, 1);
  await assert.rejects(lib.runWorkflow({ input: 'x'.repeat(7001), steps: ['Summarize'] }), /too long/);
});
test('all eight routes render usable controls, including voice without speech support', () => {
  const previous = globalThis.window;
  globalThis.window = {};
  try {
    for (const [tool, expected] of [['compare', 'Compare answers'], ['documents', 'Ask document'], ['projects', 'Save project'], ['learn', 'Build my lesson'], ['voice', 'Send message'], ['saved', 'Save to collection'], ['write', 'Create draft'], ['automate', 'Run workflow']]) {
      const html = renderToString(h(MemoryRouter, { initialEntries: ['/everyday-ai/' + tool] }, h(Routes, null, h(Route, { path: '/everyday-ai/:tool', element: h(EverydayAI) }))));
      assert.ok(html.includes(expected), tool); assert.ok(html.includes('Everyday AI tools'), tool);
      if (tool === 'voice') assert.ok(html.includes('Voice input is unavailable'));
    }
  } finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
});
