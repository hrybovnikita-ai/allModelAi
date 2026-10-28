import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('design system defines chat radius tokens', async () => {
  const css = await readFile(path.join(root, 'src/styles/design-system.css'), 'utf8');
  assert.match(css, /--radius-pill:\s*9999px/);
  assert.match(css, /--radius-message:\s*20px/);
  assert.match(css, /--radius-input:\s*24px/);
  assert.match(css, /--radius-code:\s*16px/);
});

test('Chat.jsx loads rounded theme stylesheet last among chat shells', async () => {
  const source = await readFile(path.join(root, 'src/components/Chat/Chat.jsx'), 'utf8');
  const roundedIdx = source.indexOf("import './ChatRoundedTheme.css'");
  const mobileIdx = source.indexOf("import './ChatMobileLayout.css'");
  assert.ok(roundedIdx > mobileIdx);
});

test('chat rounded theme scopes sidebar and composer to .chat-page', async () => {
  const css = await readFile(path.join(root, 'src/components/Chat/ChatRoundedTheme.css'), 'utf8');
  assert.match(css, /\.chat-page \.new-chat-compact/);
  assert.match(css, /border-radius:\s*var\(--radius-pill\)/);
  assert.match(css, /\.chat-page \.chat-composer-modern \.composer-box/);
  assert.match(css, /border-radius:\s*var\(--radius-input\)/);
  assert.match(css, /\.chat-page \.chat-message\.user > div/);
});
