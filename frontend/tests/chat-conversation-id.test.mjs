import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const chatSource = readFileSync(path.join(root, 'src/components/Chat/Chat.jsx'), 'utf8');
const messageContentSource = readFileSync(path.join(root, 'src/components/Chat/ChatMessageContent.jsx'), 'utf8');

test('Chat.jsx passes activeConversationId to ChatMessageContent in message map', () => {
  assert.match(
    chatSource,
    /ChatMessageContent[\s\S]*?conversationId=\{temporaryChat \? null : activeConversationId\}/,
  );
  assert.doesNotMatch(chatSource, /ChatMessageContent[\s\S]*?conversationId=\{conversationId\}/);
});

test('ChatMessageContent treats conversationId as optional prop', () => {
  assert.match(messageContentSource, /conversationId = null/);
});

test('FileCard and MessageActions use activeConversationId in the same message map', () => {
  const mapBlock = chatSource.slice(chatSource.indexOf('messages.map((message, index)'), chatSource.indexOf('messages.map((message, index)') + 8000);
  assert.match(mapBlock, /activeConversationId/);
  assert.doesNotMatch(mapBlock, /conversationId=\{conversationId\}/);
});
