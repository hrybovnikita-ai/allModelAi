import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const chatSource = readFileSync(path.join(root, 'src/components/Chat/Chat.jsx'), 'utf8');
const messageContentSource = readFileSync(path.join(root, 'src/components/Chat/ChatMessageContent.jsx'), 'utf8');

test('Chat.jsx passes activeConversationId to assistant response block in message map', () => {
  assert.match(
    chatSource,
    /ChatResponseBlock[\s\S]{0,400}?conversationId=\{activeConversationId\}/,
  );
  assert.doesNotMatch(chatSource, /ChatResponseBlock[\s\S]{0,240}?conversationId=\{conversationId\}/);
});

test('ChatMessageContent treats conversationId as optional prop', () => {
  assert.match(messageContentSource, /conversationId = null/);
});

test('FileCard and MessageActions use activeConversationId in the same message map', () => {
  const mapStart = chatSource.indexOf('messages.map((message, index)');
  assert.ok(mapStart >= 0);
  const mapBlock = chatSource.slice(mapStart, mapStart + 12000);
  assert.match(mapBlock, /FileCard[\s\S]{0,120}?conversationId=\{activeConversationId\}/);
  assert.match(mapBlock, /MessageActions[\s\S]{0,500}?conversationId=\{activeConversationId\}/);
  assert.doesNotMatch(mapBlock, /conversationId=\{conversationId\}/);
});
