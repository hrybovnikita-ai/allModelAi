import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('AiLearningLab calls backend AI learning API (not Python directly)', async () => {
  const source = await readFile(new URL('../src/components/AiLearning/AiLearningLab.jsx', import.meta.url), 'utf8');
  assert.match(source, /\/api\/ai\/lessons/);
  assert.match(source, /\/api\/ai\/train\//);
  assert.doesNotMatch(source, /5055|VITE_.*PYTHON|OPENAI_API_KEY/);
});

test('firebase.js keeps authDomain independent from public site hostname', async () => {
  const source = await readFile(new URL('../src/lib/firebase.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /return 'all-model-ai\.com'/);
  assert.match(source, /VITE_FIREBASE_AUTH_DOMAIN/);
});
