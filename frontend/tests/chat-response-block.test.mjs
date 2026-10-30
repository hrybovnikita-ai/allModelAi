import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('Chat.jsx integrates ChatResponseBlock for assistant streaming', () => {
  const chat = readFileSync(join(root, 'src/components/Chat/Chat.jsx'), 'utf8');
  assert.match(chat, /ChatResponseBlock/);
  assert.match(chat, /waitingForFirstToken/);
  assert.doesNotMatch(chat, /ThinkingMessage/);
  assert.doesNotMatch(chat, /isPendingAssistant && isSending && index === messages\.length - 1\) return null/);
});

test('ChatResponseBlock composes ChatMessageContent and ThinkingDot', () => {
  const block = readFileSync(join(root, 'src/components/Chat/ChatResponseBlock.jsx'), 'utf8');
  assert.match(block, /ChatMessageContent/);
  assert.match(block, /ThinkingDot/);
  assert.match(block, /AnimatePresence/);
  assert.match(readFileSync(join(root, 'src/components/Chat/ChatResponseBlock.css'), 'utf8'), /chat-response-block/);
});

test('StreamingText avoids motion re-entry on each token', () => {
  const streaming = readFileSync(join(root, 'src/components/Chat/animation/StreamingText.jsx'), 'utf8');
  assert.doesNotMatch(streaming, /motion\.p/);
  assert.match(streaming, /stream-cursor/);
});
