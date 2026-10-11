import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));

test('Chat renders GeneratedVideoCard from persisted video metadata', () => {
  const chat = readFileSync(`${root}src/components/Chat/Chat.jsx`, 'utf8');
  assert.match(chat, /messageHasPlayableVideo\(message\) && message\.role !== 'user' && <GeneratedVideoCard/);
});

test('video completion uses durable assistant video message builder', () => {
  const chat = readFileSync(`${root}src/components/Chat/Chat.jsx`, 'utf8');
  assert.match(chat, /buildAssistantVideoMessage\(finalVideo/);
  assert.match(chat, /normalizeConversationMessages/);
});
