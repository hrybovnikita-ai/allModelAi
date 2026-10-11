import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('chat mobile layout defines header rows and overflow-safe messages', async () => {
  const css = await readFile(
    new URL('../src/components/Chat/ChatMobileLayout.css', import.meta.url),
    'utf8',
  );
  const jsx = await readFile(
    new URL('../src/components/Chat/Chat.jsx', import.meta.url),
    'utf8',
  );
  assert.match(css, /chat-header-primary/);
  assert.match(css, /chat-header-secondary/);
  assert.match(css, /grid-template-rows:\s*auto auto minmax\(0,\s*1fr\)/);
  assert.match(css, /access-mode-switch button[\s\S]*flex:\s*1 1 0/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /generated-image[\s\S]*max-width:\s*100%/);
  assert.match(jsx, /chat-header-primary/);
  assert.match(jsx, /chat-header-secondary/);
});
