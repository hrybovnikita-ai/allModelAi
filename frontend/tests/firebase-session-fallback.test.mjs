import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clearFirebaseIdTokenFallback,
  firebaseSessionFallbackHeaders,
  stashFirebaseIdToken,
} from '../src/lib/firebaseSessionFallback.js';

test('firebase session fallback attaches Authorization header while token is fresh', () => {
  clearFirebaseIdTokenFallback();
  assert.deepEqual(firebaseSessionFallbackHeaders(), {});
  stashFirebaseIdToken('eyJ.test.token', 3600);
  const headers = firebaseSessionFallbackHeaders();
  assert.match(headers.Authorization, /^Bearer eyJ\.test\.token$/);
  clearFirebaseIdTokenFallback();
  assert.deepEqual(firebaseSessionFallbackHeaders(), {});
});

test('auth fetch stack includes firebase session fallback headers', async () => {
  const { readFile } = await import('node:fs/promises');
  const session = await readFile(new URL('../src/lib/session.js', import.meta.url), 'utf8');
  const httpJson = await readFile(new URL('../src/lib/httpJson.js', import.meta.url), 'utf8');
  const nativeFetch = await readFile(new URL('../src/lib/nativeFetch.js', import.meta.url), 'utf8');
  assert.match(session, /firebaseSessionFallbackHeaders/);
  assert.match(httpJson, /firebaseSessionFallbackHeaders/);
  assert.match(nativeFetch, /firebaseSessionFallbackHeaders/);
});
