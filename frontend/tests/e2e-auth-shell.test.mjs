import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('playwright auth shell covers login and does not use real credentials', async () => {
  const spec = await readFile(new URL('../e2e/auth-shell.spec.js', import.meta.url), 'utf8');
  assert.match(spec, /continue with google/i);
  assert.match(spec, /continue with github/i);
  assert.doesNotMatch(spec, /password:\s*['"][^'"]+['"]/);
  assert.match(spec, /Control\+K/);
});
