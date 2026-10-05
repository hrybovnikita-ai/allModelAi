import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vercelConfig = JSON.parse(fs.readFileSync(path.join(frontendRoot, 'vercel.json'), 'utf8'));

test('frontend vercel.json proxies /api to Render before SPA fallback', () => {
  const rewrites = vercelConfig.rewrites;
  assert.ok(Array.isArray(rewrites) && rewrites.length >= 2);
  const authRule = rewrites.find((rule) => String(rule.source).includes('/__/auth/'));
  assert.ok(authRule, 'expected Firebase auth handler proxy');
  assert.match(String(authRule.destination), /firebaseapp\.com\/__\/auth\//);
  const apiRule = rewrites.find((rule) => String(rule.source).startsWith('/api/'));
  assert.ok(apiRule, 'expected /api proxy rule');
  assert.match(String(apiRule.destination), /^https:\/\/allmodelai-backend\.onrender\.com\/api\//);
  const spaRule = rewrites.find((rule) => String(rule.destination) === '/index.html');
  assert.ok(spaRule, 'expected SPA fallback to index.html');
  assert.doesNotMatch(String(spaRule.source), /^\/api\//);
});

test('frontend vercel.json does not send /api to index.html', () => {
  for (const rule of vercelConfig.rewrites) {
    if (String(rule.destination) === '/index.html') {
      assert.doesNotMatch(String(rule.source), /^\/?api/);
    }
  }
});
