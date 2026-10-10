import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));

test('video generation client maps Magic Hour errors and async jobs', () => {
  const src = readFileSync(`${root}src/lib/videoGeneration.js`, 'utf8');
  assert.match(src, /MAGIC_HOUR_INSUFFICIENT_CREDITS/);
  assert.match(src, /pollVideoJob/);
  assert.match(src, /\/api\/video\/generate/);
  assert.match(src, /\/api\/videos/);
  assert.match(src, /durationSeconds/);
});

test('Chat wires Make video skill to video generation API', () => {
  const src = readFileSync(`${root}src/components/Chat/Chat.jsx`, 'utf8');
  assert.match(src, /VideoGenerationPanel/);
  assert.match(src, /pollVideoJob/);
  assert.match(src, /Generate video/);
});
