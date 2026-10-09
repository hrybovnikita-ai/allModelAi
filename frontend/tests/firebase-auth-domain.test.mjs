import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { resolveAuthDomainForRuntime } from '../src/lib/firebaseAuthDomain.js';

const root = fileURLToPath(new URL('../', import.meta.url));

test('resolveAuthDomainForRuntime keeps firebaseapp.com when no override', () => {
  assert.equal(
    resolveAuthDomainForRuntime('allmodelai.firebaseapp.com'),
    'allmodelai.firebaseapp.com',
  );
});

test('VITE_FIREBASE_AUTH_DOMAIN overrides configured firebaseapp.com', () => {
  assert.equal(
    resolveAuthDomainForRuntime('allmodelai.firebaseapp.com', {
      envAuthDomain: 'all-model-ai.com',
    }),
    'all-model-ai.com',
  );
});

test('hosted production web auto-uses custom hostname when config is firebaseapp.com', () => {
  assert.equal(
    resolveAuthDomainForRuntime('allmodelai.firebaseapp.com', {
      preferHostedAuthDomainWhenProxied: true,
      hostedHostname: 'all-model-ai.com',
    }),
    'all-model-ai.com',
  );
});

test('custom auth domain flag uses hosted site hostname on production web', () => {
  assert.equal(
    resolveAuthDomainForRuntime('allmodelai.firebaseapp.com', {
      customAuthDomainEnabled: true,
      hostedHostname: 'all-model-ai.com',
    }),
    'all-model-ai.com',
  );
});

test('vercel.json proxies Firebase auth handler under /__/auth', () => {
  const vercel = readFileSync(`${root}vercel.json`, 'utf8');
  assert.match(vercel, /\/__\/auth/);
  assert.match(vercel, /allmodelai\.firebaseapp\.com\/__\/auth\/:path\*/);
  assert.match(vercel, /"source": "\/__\/auth\/:path\*"/);
});
