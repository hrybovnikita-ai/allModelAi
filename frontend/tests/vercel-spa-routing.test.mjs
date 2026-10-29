import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAllModelAiVercelRewrites } from './vercel-rewrite-helpers.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const vercelConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8'));

test('root vercel.json routes /api and /__/auth before SPA catch-all', () => {
  assertAllModelAiVercelRewrites(vercelConfig, 'root');
  const spaRule = vercelConfig.rewrites[vercelConfig.rewrites.length - 1];
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
