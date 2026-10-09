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

test('resolveAuthDomainForRuntime uses env auth domain when set', () => {
  assert.equal(
    resolveAuthDomainForRuntime('allmodelai.firebaseapp.com', {
      envAuthDomain: 'allmodelai.firebaseapp.com',
    }),
    'allmodelai.firebaseapp.com',
  );
});

test('hosted production web does not replace firebaseapp.com unless custom auth flag', () => {
  assert.equal(
    resolveAuthDomainForRuntime('allmodelai.firebaseapp.com', {
      preferHostedAuthDomainWhenProxied: true,
      hostedHostname: 'allmodelai.com',
    }),
    'allmodelai.com',
  );
  assert.equal(
    resolveAuthDomainForRuntime('allmodelai.firebaseapp.com', {
      hostedHostname: 'allmodelai.com',
    }),
    'allmodelai.firebaseapp.com',
  );
});

test('custom auth domain flag uses hosted site hostname', () => {
  assert.equal(
    resolveAuthDomainForRuntime('allmodelai.firebaseapp.com', {
      customAuthDomainEnabled: true,
      hostedHostname: 'allmodelai.com',
    }),
    'allmodelai.com',
  );
});

test('empty configured domain falls back to default firebaseapp.com', () => {
  assert.equal(resolveAuthDomainForRuntime(''), 'allmodelai.firebaseapp.com');
});

test('vercel.json proxies Firebase auth handler under /__/auth', () => {
  const vercel = readFileSync(`${root}vercel.json`, 'utf8');
  assert.match(vercel, /\/__\/auth/);
  assert.match(vercel, /allmodelai\.firebaseapp\.com\/__\/auth\/:path\*/);
  assert.match(vercel, /"source": "\/__\/auth\/:path\*"/);
});
