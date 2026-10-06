import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));

test('PWA workbox uses NetworkOnly for API paths and denies auth navigation fallback', () => {
  const src = readFileSync(`${root}vite.config.js`, 'utf8');
  assert.match(src, /handler:\s*'NetworkOnly'/);
  assert.match(src, /\/\^\\\/api/);
  assert.match(src, /navigateFallbackDenylist/);
  assert.match(src, /\/\^\\\/auth/);
});
