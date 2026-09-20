import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';

let server;
let chat;
before(async () => {
  server = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
    plugins: [{
      name: 'chat-test-internals',
      enforce: 'pre',
      transform(code, id) {
        if (id.replaceAll('\\', '/').endsWith('/components/Chat/Chat.jsx')) {
          return `${code}\nexport { safeStorageGet, safeStorageSet, validModelSlug, subscribeVoices };`;
        }
      },
    }],
  });
  chat = await server.ssrLoadModule('/src/components/Chat/Chat.jsx');
});
after(async () => { await server?.close(); });

function globals(t, descriptors) {
  const original = Object.fromEntries(Object.keys(descriptors).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, descriptor] of Object.entries(descriptors)) {
    Object.defineProperty(globalThis, key, { configurable: true, ...descriptor });
  }
  t.after(() => {
    for (const [key, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
}
function renderChat(path = '/chat') {
  // Match RequireAuth's actual Outlet contract: no profile is required in storage.
  return renderToString(h(MemoryRouter, { initialEntries: [path] }, h(Routes, null,
    h(Route, { element: h(Outlet, { context: { user: { name: 'Tablet User', email: 'tablet@example.com' } } }) },
      h(Route, { path: '/chat', element: h(chat.default) })))));
}
function assertChat(html) {
  assert.match(html, /class="chat-page"/);
  assert.match(html, /class="chat-composer(?:\s[^"]*)?"/);
  assert.match(html, /aria-label="Chat message"/);
}
const deny = () => { throw new Error('Safari storage denied'); };

test('Chat renders with denied storage properties and no navigator', t => {
  globals(t, { localStorage: { get: deny }, sessionStorage: { get: deny }, navigator: { value: undefined } });
  assertChat(renderChat());
  assert.equal(chat.safeStorageGet('localStorage', 'test', 'fallback'), 'fallback');
  assert.doesNotThrow(() => chat.safeStorageSet('localStorage', 'test', 'value'));
});
test('Chat renders and preference writes survive storage quota/access failures', t => {
  const storage = { getItem: deny, setItem: deny };
  globals(t, { localStorage: { value: storage }, sessionStorage: { value: storage } });
  assertChat(renderChat());
  assert.doesNotThrow(() => chat.safeStorageSet('localStorage', 'allmodelai_voice_mode', 'true'));
});
test('corrupt, null and wrong-shaped saved JSON cannot crash Chat', t => {
  let saved;
  globals(t, { localStorage: { value: { getItem: () => saved } }, sessionStorage: { get: deny } });
  for (saved of ['{broken', 'null', 'true', '42', '"wrong shape"', '{}', '[]']) {
    assertChat(renderChat('/chat?model=missing-model'));
  }
});
test('malformed collection entries and appearance fields are ignored', t => {
  const data = {
    allmodelai_projects: '[null,42,{"name":{}},{"id":"p1","name":"Saved project"}]',
    allmodelai_favorites: '[null,42,{"text":{}},{"id":"f1","text":"Saved answer"}]',
    allmodelai_appearance: '{"theme":42,"textColor":{}}',
    allmodelai_model_versions: 'null',
  };
  globals(t, { localStorage: { value: { getItem: key => data[key] ?? null } }, sessionStorage: { get: deny } });
  const html = renderChat();
  assertChat(html);
  assert.match(html, /Saved project/);
  assert.match(html, /Saved answer/);
});
test('invalid saved/query/history model slugs fall back while valid selections survive', t => {
  let slug = 'retired-model';
  globals(t, { localStorage: { value: { getItem: key => key === 'allmodelai_selected_model' ? slug : null } } });
  assert.match(renderChat(), /Chatting with<\/small><strong>GPT/);
  assert.match(renderChat('/chat?model=retired-model'), /Chatting with<\/small><strong>GPT/);
  slug = 'claude';
  assert.match(renderChat(), /Chatting with<\/small><strong>Claude/);
  assert.equal(chat.validModelSlug('retired-history-model'), 'gpt');
  assert.equal(chat.validModelSlug(null), 'gpt');
  assert.equal(chat.validModelSlug('smart'), 'smart');
});
test('speech initializes and cleans up with EventTarget APIs', () => {
  const events = new EventTarget();
  let voices = [];
  let calls = 0;
  let received;
  events.getVoices = () => voices;
  const cleanup = chat.subscribeVoices(events, value => { calls++; received = value; });
  voices = [{ name: 'Voice', lang: 'en-US' }];
  events.dispatchEvent(new Event('voiceschanged'));
  assert.deepEqual(received, voices);
  assert.equal(calls, 2);
  cleanup();
  events.dispatchEvent(new Event('voiceschanged'));
  assert.equal(calls, 2);
});
test('legacy Safari speech callback updates voices and restores the previous handler', () => {
  let previousCalls = 0;
  const previous = () => { previousCalls++; };
  let voices = [];
  const synthesis = { getVoices: () => voices, onvoiceschanged: previous };
  let received;
  const cleanup = chat.subscribeVoices(synthesis, value => { received = value; });
  voices = [{ name: 'Samantha', lang: 'en-US' }];
  synthesis.onvoiceschanged(new Event('voiceschanged'));
  assert.deepEqual(received, voices);
  assert.equal(previousCalls, 1);
  cleanup();
  assert.equal(synthesis.onvoiceschanged, previous);
});
test('unavailable speech and failed voice discovery do not throw', () => {
  assert.equal(chat.subscribeVoices(undefined, () => {}), undefined);
  let voices;
  const cleanup = chat.subscribeVoices({ getVoices: deny }, value => { voices = value; });
  assert.deepEqual(voices, []);
  cleanup();
});

test('App Builder uses the verified session when browser storage is unavailable', async t => {
  globals(t, { localStorage: { get: deny }, sessionStorage: { get: deny } });
  const builder = await server.ssrLoadModule('/src/components/WebsiteBuilder/WebsiteBuilder.jsx');
  const html = renderToString(h(MemoryRouter, { initialEntries: ['/app-builder'] }, h(Routes, null,
    h(Route, { element: h(Outlet, { context: { user: { name: 'Builder', email: 'builder@example.com' } } }) },
      h(Route, { path: '/app-builder', element: h(builder.default) })))));
  assert.match(html, /Create app/);
  assert.match(html, /Create image/);
  assert.match(html, /sandbox="allow-scripts"/);
});


test('Chat includes the file creation mode', () => {
  assert.match(renderChat(), />Create file<\/button>/);
});

test('file card opens a named file and the viewer renders code as text', async () => {
  const { default: GeneratedFile, FileCard } = await server.ssrLoadModule('/src/components/GeneratedFile/GeneratedFile.jsx');
  const { parseGeneratedFile } = await import('../src/lib/generatedFiles.js');
  const payload = JSON.stringify({ type: 'allmodelai-file', name: 'index.html', title: 'My requested page', content: '<script>alert("test")</script>\n<h1>Hello</h1>' });
  const file = parseGeneratedFile(payload);
  const card = renderToString(h(MemoryRouter, null, h(FileCard, { file, conversationId: 'saved-chat' })));
  assert.match(card, new RegExp(`/files/saved-chat/${file.id}`));
  assert.match(card, /index.html/);
  assert.match(card, /My requested page/);
  const page = renderToString(h(MemoryRouter, { initialEntries: [{ pathname: `/files/temporary/${file.id}`, state: { file: payload } }] }, h(Routes, null,
    h(Route, { path: '/files/:conversationId/:fileId', element: h(GeneratedFile) }))));
  assert.match(page, /My requested page/);
  assert.match(page, /Download file/);
  assert.match(page, /&lt;script&gt;/);
  assert.doesNotMatch(page, /<script>/);
  assert.match(page, /Temporary file/);
});
