import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { firebaseProviderId, SOCIAL_PROVIDER_LABELS } from '../src/lib/socialProviders.js';

test('social provider labels include GitHub instead of Facebook', () => {
  assert.deepEqual(SOCIAL_PROVIDER_LABELS, ['Google', 'Apple', 'GitHub']);
  assert.equal(firebaseProviderId('GitHub'), 'github.com');
  assert.equal(firebaseProviderId('Google'), 'google.com');
});

test('login UI references GitHub social sign-in', async () => {
  const login = await readFile(new URL('../src/components/Login/Login.jsx', import.meta.url), 'utf8');
  assert.match(login, /GitHub/);
  assert.doesNotMatch(login, /Facebook/);
});

test('socialSignIn uses Firebase GitHub OAuth provider', async () => {
  const source = await readFile(new URL('../src/lib/socialSignIn.js', import.meta.url), 'utf8');
  assert.match(source, /OAuthProvider\('github\.com'\)/);
  assert.doesNotMatch(source, /FacebookAuthProvider/);
});
