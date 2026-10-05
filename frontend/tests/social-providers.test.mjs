import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { firebaseProviderId, SOCIAL_PROVIDER_LABELS } from '../src/lib/socialProviders.js';

test('social provider labels include Google only', () => {
  assert.deepEqual(SOCIAL_PROVIDER_LABELS, ['Google']);
  assert.equal(firebaseProviderId('Google'), 'google.com');
});

test('login UI offers Google social sign-in only', async () => {
  const login = await readFile(new URL('../src/components/Login/Login.jsx', import.meta.url), 'utf8');
  assert.match(login, /Continue with Google/);
  assert.doesNotMatch(login, /Continue with Apple/);
  assert.doesNotMatch(login, /Continue with GitHub/);
  assert.doesNotMatch(login, /Facebook/);
});

test('socialSignIn uses Firebase GoogleAuthProvider', async () => {
  const source = await readFile(new URL('../src/lib/socialSignIn.js', import.meta.url), 'utf8');
  assert.match(source, /GoogleAuthProvider/);
  assert.match(source, /new GoogleAuthProvider\(\)/);
  assert.doesNotMatch(source, /GithubAuthProvider/);
  assert.doesNotMatch(source, /OAuthProvider\('apple\.com'\)/);
});
