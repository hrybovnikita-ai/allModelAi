import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('sign-in and sign-up forms expose Name, Email, Password; sign-up adds confirm password', async () => {
  const login = await readFile(new URL('../src/components/Login/Login.jsx', import.meta.url), 'utf8');
  assert.match(login, /name="name"/);
  assert.match(login, /name="email"/);
  assert.match(login, /name="password"/);
  assert.match(login, /name="confirmPassword"/);
  assert.match(login, /signingUp &&/);
  assert.match(login, /\.\.\.\(optionalName \? \{ name: optionalName \} : \{\}\)/);
});
