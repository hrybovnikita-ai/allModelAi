import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vercelConfig = JSON.parse(fs.readFileSync(path.join(frontendRoot, 'vercel.json'), 'utf8'));

test('frontend vercel.json proxies Firebase /__/auth before SPA catch-all', () => {
  const rewrites = vercelConfig.rewrites;
  assert.ok(Array.isArray(rewrites) && rewrites.length >= 4);

  const authIndex = rewrites.findIndex((rule) => String(rule.source).includes('/__/auth/'));
  const spaIndex = rewrites.findIndex((rule) => String(rule.destination) === '/index.html');
  assert.ok(authIndex >= 0, 'expected Firebase auth handler proxy');
  assert.ok(spaIndex >= 0, 'expected SPA fallback to index.html');
  assert.ok(authIndex < spaIndex, '/__/auth proxy must appear before SPA catch-all');

  const authRule = rewrites[authIndex];
  assert.match(String(authRule.source), /\/__\/auth\//);
  assert.match(String(authRule.destination), /firebaseapp\.com\/__\/auth\//);

  const apiRule = rewrites.find((rule) => String(rule.source).startsWith('/api/'));
  assert.ok(apiRule, 'expected /api proxy rule');
  assert.match(String(apiRule.destination), /^https:\/\/allmodelai-backend\.onrender\.com\/api\//);
  assert.ok(rewrites.indexOf(apiRule) < spaIndex, '/api proxy must appear before SPA catch-all');
});

test('frontend vercel.json SPA catch-all is last and does not use a broken negative lookahead', () => {
  const rewrites = vercelConfig.rewrites;
  const spaRule = rewrites[rewrites.length - 1];
  assert.equal(spaRule.destination, '/index.html');
  assert.match(String(spaRule.source), /^\/\(\.\*\)$/);
});
