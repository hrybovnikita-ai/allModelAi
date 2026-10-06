import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(frontendRoot, '..');
const frontendConfig = JSON.parse(fs.readFileSync(path.join(frontendRoot, 'vercel.json'), 'utf8'));
const rootConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8'));

function assertFirebaseAuthProxyFirst(vercelConfig, label) {
  const rewrites = vercelConfig.rewrites;
  assert.ok(Array.isArray(rewrites) && rewrites.length >= 3, `${label}: expected rewrites array`);

  assert.equal(rewrites[0].source, '/__/auth/:path*', `${label}: Firebase auth must be first rewrite`);
  assert.equal(
    rewrites[0].destination,
    'https://allmodelai.firebaseapp.com/__/auth/:path*',
    `${label}: Firebase auth destination`,
  );

  const spaIndex = rewrites.findIndex((rule) => rule.destination === '/index.html');
  assert.ok(spaIndex >= 0, `${label}: expected SPA fallback`);
  assert.equal(spaIndex, rewrites.length - 1, `${label}: SPA catch-all must be last`);

  const apiRule = rewrites.find((rule) => rule.source === '/api/:path*');
  assert.ok(apiRule, `${label}: expected /api/:path* proxy`);
  assert.equal(
    apiRule.destination,
    'https://allmodelai-backend.onrender.com/api/:path*',
  );
  assert.ok(rewrites.indexOf(apiRule) < spaIndex, `${label}: /api proxy before SPA`);
}

test('frontend vercel.json proxies Firebase /__/auth before SPA catch-all', () => {
  assertFirebaseAuthProxyFirst(frontendConfig, 'frontend');
});

test('root vercel.json matches frontend Firebase and API rewrite rules', () => {
  assertFirebaseAuthProxyFirst(rootConfig, 'root');
  assert.deepEqual(
    rootConfig.rewrites.map(({ source, destination }) => ({ source, destination })),
    frontendConfig.rewrites.map(({ source, destination }) => ({ source, destination })),
  );
});

test('frontend vercel.json uses :path* syntax for external proxies', () => {
  const external = frontendConfig.rewrites.filter((rule) => rule.destination.startsWith('https://'));
  assert.ok(external.length >= 2);
  for (const rule of external) {
    assert.match(String(rule.source), /:path\*$/);
    assert.match(String(rule.destination), /:path\*$/);
  }
});
