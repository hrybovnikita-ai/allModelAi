import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Google popup login confirms session before dashboard navigation', async () => {
  const login = await readFile(new URL('../src/components/Login/Login.jsx', import.meta.url), 'utf8');
  assert.match(login, /navigateAfterSocialLogin/);
  assert.doesNotMatch(login, /navigate\('\/dashboard'[\s\S]*state:\s*\{\s*user:\s*outcome/);
});
