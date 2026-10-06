import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const vercelConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8'));

test('root vercel.json routes /api and /__/auth before SPA catch-all', () => {
  const rewrites = vercelConfig.rewrites;
  assert.ok(Array.isArray(rewrites) && rewrites.length >= 3);
  assert.equal(rewrites[0].source, '/__/auth/:path*');
  assert.match(String(rewrites[1].source), /^\/api\//);
  const spaRule = rewrites[rewrites.length - 1];
  assert.equal(spaRule.destination, '/index.html');
  assert.match(String(spaRule.source), /\(\.\*\)/);
});

test('root vercel builds frontend workspace output', () => {
  assert.equal(vercelConfig.outputDirectory, 'frontend/dist');
  assert.match(String(vercelConfig.buildCommand), /frontend/);
});

test('top-level rewrites do not send /api or /__/auth traffic to index.html', () => {
  for (const rule of vercelConfig.rewrites) {
    if (rule.destination === '/index.html') {
      assert.doesNotMatch(String(rule.source), /^\/?api/);
      assert.doesNotMatch(String(rule.source), /__\/auth/);
    }
  }
});
