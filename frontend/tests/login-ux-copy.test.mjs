import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('login form uses short UX copy without long Google password essays', async () => {
  const source = await readFile(
    new URL('../src/components/Login/Login.jsx', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /Used Google before\?/);
  assert.doesNotMatch(source, /login-auth-hint/);
  assert.doesNotMatch(source, /login-intro/);
  assert.match(source, /Unable to sign in\. Check your details or reset your password\./);
  assert.match(source, /Connection problem\. Please try again\./);
  assert.match(source, /Welcome back!/);
  assert.match(source, /Signing in…/);
  assert.match(source, /Full name/);
  assert.match(source, /name="confirmPassword"/);
  assert.match(source, /Confirm password/);
});
