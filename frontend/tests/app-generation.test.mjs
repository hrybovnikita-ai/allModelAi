import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractApplication, readGenerationStream } from '../src/lib/appGeneration.js';

test('extracts all files and refuses incomplete output instead of mixing old and new code', () => {
  assert.deepEqual(extractApplication('```html\n<button>Hi</button>\n```\n```css\n\n```\n```js\nalert(1)\n```'), { html: '<button>Hi</button>', css: '', js: 'alert(1)' });
  assert.throws(() => extractApplication('```html\n<h1>Incomplete</h1>\n```'), /incomplete/);
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
