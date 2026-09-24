import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractApplication, readGenerationStream } from '../src/lib/appGeneration.js';
import { CSS_FILE, DEFAULT_PAGE, JS_FILE, normalizeProject, resolvePreviewPage } from '../src/lib/websiteProject.js';

test('extracts legacy single-page files into a normalized project', () => {
  assert.deepEqual(extractApplication('```html\n<button>Hi</button>\n```\n```css\n\n```\n```js\nalert(1)\n```'), {
    [DEFAULT_PAGE]: '<button>Hi</button>',
    [CSS_FILE]: '',
    [JS_FILE]: 'alert(1)',
  });
  assert.throws(() => extractApplication('```html\n<h1>Incomplete</h1>\n```'), /incomplete/);
});

test('extracts multi-page website files', () => {
  const project = extractApplication([
    '```index.html\n<nav><a href="about.html">About</a></nav>\n```',
    '```about.html\n<h1>About</h1>\n```',
    '```css\nbody{margin:0}\n```',
    '```script.js\nconsole.log("ok")\n```',
  ].join('\n'));
  assert.equal(project['about.html'], '<h1>About</h1>');
  assert.match(project[CSS_FILE], /margin:0/);
  assert.equal(project[JS_FILE], 'console.log("ok")');
});

test('normalizes saved legacy html/css/js objects', () => {
  const project = normalizeProject({ html: '<main/>', css: 'a{}', js: '1' });
  assert.equal(project[DEFAULT_PAGE], '<main/>');
  assert.equal(project[CSS_FILE], 'a{}');
});

test('resolves internal preview links', () => {
  const files = { 'index.html': '', 'about.html': '', [CSS_FILE]: '', [JS_FILE]: '' };
  assert.deepEqual(resolvePreviewPage('about.html', 'index.html', files), { page: 'about.html', hash: '' });
  assert.deepEqual(resolvePreviewPage('./about.html', 'index.html', files), { page: 'about.html', hash: '' });
  assert.deepEqual(resolvePreviewPage('#features', 'index.html', files), { page: 'index.html', hash: '#features' });
  assert.equal(resolvePreviewPage('https://example.com', 'index.html', files), null);
});

test('handles byte-split UTF-8 SSE and a final event without a blank line', async () => {
  const bytes = new TextEncoder().encode('data: {"text":"Привет"}\r\n\r\ndata: [DONE]');
  const response = new Response(new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
    controller.close();
  } }));
  assert.equal(await readGenerationStream(response), 'Привет');
});

test('rejects streamed errors and interrupted generations', async () => {
  await assert.rejects(readGenerationStream(new Response('data: {"error":"Provider offline"}\n\ndata: [DONE]\n\n')), /Provider offline/);
  await assert.rejects(readGenerationStream(new Response('data: {"text":"Partial"}\n\n')), /interrupted/);
});
