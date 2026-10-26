import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('sign-up exposes name, email, password, confirm; sign-in has email and password only', async () => {
  const login = await readFile(new URL('../src/components/Login/Login.jsx', import.meta.url), 'utf8');
  assert.match(login, /name="email"/);
  assert.match(login, /name="password"/);
  assert.match(login, /name="confirmPassword"/);
  assert.match(login, /signingUp &&/);
  assert.match(login, /Full name/);
  assert.doesNotMatch(login, /Name \(optional\)/);
  assert.doesNotMatch(login, /optionalName/);
});
