import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('chat UI does not render Smart Router debug panel under messages', async () => {
  const chat = await readFile(new URL('../src/components/Chat/Chat.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(chat, /SmartRouterStatus/);
  assert.doesNotMatch(chat, /smart-router-status/);
  assert.match(chat, /MessageActions/);
  assert.match(chat, /KnowledgeSourceChips/);
});
