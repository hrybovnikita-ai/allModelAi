import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Vite serves same-origin-allow-popups without globally disabling COOP', async () => {
  const config = await readFile(new URL('../vite.config.js', import.meta.url), 'utf8');
  assert.match(config, /Cross-Origin-Opener-Policy['"]:\s*['"]same-origin-allow-popups['"]/);
  assert.match(config, /headers:\s*oauthCoopHeaders/);
  assert.match(config, /proxyRes\.headers\['cross-origin-opener-policy'\] = 'same-origin-allow-popups'/);
  assert.match(config, /delete proxyRes\.headers\['cross-origin-embedder-policy'\]/);
  assert.doesNotMatch(config, /unsafe-none/);
  assert.doesNotMatch(config, /Cross-Origin-Embedder-Policy['"]:\s*['"]require-corp['"]/);
});

test('Vercel HTML and /__/auth use popup-compatible COOP, not API-wide disable', async () => {
  const root = await readFile(new URL('../../vercel.json', import.meta.url), 'utf8');
  const frontend = await readFile(new URL('../vercel.json', import.meta.url), 'utf8');
  for (const source of [root, frontend]) {
    assert.match(source, /"key": "Cross-Origin-Opener-Policy"/);
    assert.match(source, /"value": "same-origin-allow-popups"/);
    assert.match(source, /\/__\/auth\/:path\*/);
    assert.doesNotMatch(source, /unsafe-none/);
    const headers = source.slice(source.indexOf('"headers"'));
    const apiBlock = headers.slice(headers.indexOf('/api/:path*'), headers.indexOf('/__/auth'));
    assert.doesNotMatch(apiBlock, /Cross-Origin-Opener-Policy/);
  }
});
