import { test } from 'node:test';
import assert from 'node:assert/strict';

test('runtime error overlay is installed from main entry', async () => {
  const { readFile } = await import('node:fs/promises');
  const main = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
  const overlay = await readFile(new URL('../src/lib/runtimeErrorOverlay.js', import.meta.url), 'utf8');
  assert.match(main, /installRuntimeErrorOverlay/);
  assert.match(overlay, /unhandledrejection/);
  assert.match(overlay, /addEventListener\('error'/);
});
