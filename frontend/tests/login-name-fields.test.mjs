import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('sign-in and sign-up forms both expose Name, Email, Password without confirm password', async () => {
  const login = await readFile(new URL('../src/components/Login/Login.jsx', import.meta.url), 'utf8');
  assert.match(login, /name="name"/);
  assert.match(login, /name="email"/);
  assert.match(login, /name="password"/);
  assert.doesNotMatch(login, /name="confirmPassword"/);
  assert.doesNotMatch(login, /Confirm password/);
  assert.match(login, /Name\{signingUp \? '' : ' \(optional\)'\}/);
  assert.match(login, /\.\.\.\(optionalName \? \{ name: optionalName \} : \{\}\)/);
});
