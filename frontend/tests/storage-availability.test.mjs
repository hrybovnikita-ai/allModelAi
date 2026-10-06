import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertGoogleRedirectStorageAvailable,
  canUseGoogleRedirectSignIn,
} from '../src/lib/storageAvailability.js';

test('redirect sign-in requires sessionStorage probe helper', async () => {
  const { readFile } = await import('node:fs/promises');
  const signIn = await readFile(new URL('../src/lib/socialSignIn.js', import.meta.url), 'utf8');
  assert.match(signIn, /assertGoogleRedirectStorageAvailable/);
});

test('assertGoogleRedirectStorageAvailable throws auth/web-storage-unsupported when sessionStorage missing', () => {
  const previous = globalThis.sessionStorage;
  delete globalThis.sessionStorage;
  try {
    assert.equal(canUseGoogleRedirectSignIn(), false);
    assert.throws(
      () => assertGoogleRedirectStorageAvailable(),
      (error) => error.code === 'auth/web-storage-unsupported',
    );
  } finally {
    globalThis.sessionStorage = previous;
  }
});
