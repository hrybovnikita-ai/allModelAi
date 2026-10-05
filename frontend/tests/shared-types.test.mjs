import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('frontend types barrel re-exports shared contracts', async () => {
  const source = await readFile(new URL('../src/types/index.ts', import.meta.url), 'utf8');
  assert.match(source, /@allmodelai\/contracts/);
  assert.match(source, /ChatMessage/);
  assert.match(source, /RoutingDecision/);
});

test('firebase.js keeps authDomain independent from public site hostname', async () => {
  const source = await readFile(new URL('../src/lib/firebase.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /return 'all-model-ai\.com'/);
  assert.match(source, /VITE_FIREBASE_AUTH_DOMAIN/);
});
