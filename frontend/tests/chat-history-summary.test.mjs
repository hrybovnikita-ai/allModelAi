import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('chat uses summary history API and per-conversation fetch', async () => {
  const chat = await readFile(new URL('../src/components/Chat/Chat.jsx', import.meta.url), 'utf8');
  const api = await readFile(new URL('../src/lib/chatHistoryApi.js', import.meta.url), 'utf8');
  assert.match(api, /fetchChatHistoryList/);
  assert.match(api, /fetchChatConversation/);
  assert.match(api, /skipAuthRedirect:\s*true/);
  assert.match(chat, /fetchChatHistoryList/);
  assert.match(chat, /fetchChatConversation/);
  assert.doesNotMatch(chat, /includeMessages=true/);
});

test('backend list history defaults to lightweight summaries', async () => {
  const controllers = await readFile(
    new URL('../../backend/src/controllers/controllers.js', import.meta.url),
    'utf8',
  );
  assert.match(controllers, /listChatHistorySummaryRows/);
  assert.match(controllers, /getChatConversation/);
  assert.match(controllers, /includeMessages/);
});
