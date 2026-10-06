import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

test('vite.config.js proxies /api to local backend default 5050', async () => {
  const config = await readFile(new URL('../vite.config.js', import.meta.url), 'utf8');
  assert.match(config, /['"]\/api['"]/);
  assert.match(config, /127\.0\.0\.1:5050|localhost:5050/);
  assert.match(config, /API_PROXY_TARGET/);
});
