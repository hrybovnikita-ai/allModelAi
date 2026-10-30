import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('chat uses framer motion animation components', () => {
  const chat = readFileSync(join(root, 'src/components/Chat/Chat.jsx'), 'utf8');
  assert.match(chat, /ChatMessageShell/);
  assert.match(chat, /ChatResponseBlock/);
  assert.match(readFileSync(join(root, 'src/components/Chat/ChatMessageContent.jsx'), 'utf8'), /StreamingText/);
  assert.match(readFileSync(join(root, 'package.json'), 'utf8'), /"framer-motion"/);
});

test('streaming content uses StreamingText not duplicate cursor', () => {
  const content = readFileSync(join(root, 'src/components/Chat/ChatMessageContent.jsx'), 'utf8');
  assert.match(content, /StreamingText/);
  assert.doesNotMatch(content, /stream-cursor.*aria-hidden/);
});

test('animation components are memoized', () => {
  const files = [
    'src/components/Chat/animation/ThinkingDot.jsx',
    'src/components/Chat/animation/AnimatedMessage.jsx',
    'src/components/Chat/animation/StreamingText.jsx',
    'src/components/Chat/ChatMessageContent.jsx',
  ];
  for (const file of files) {
    assert.match(readFileSync(join(root, file), 'utf8'), /memo\(/);
  }
});
