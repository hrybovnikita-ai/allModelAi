import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('dashboard secondary API calls skip unauthorized force-logout', async () => {
  const source = await readFile(
    new URL('../src/components/Dashboard/Dashboard.jsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /apiFetch\(`\/api\/analytics[^`]*`,\s*\{[^}]*skipAuthRedirect:\s*true/s);
  assert.match(source, /apiFetch\(`\/api\/workspace[^`]*`,\s*\{[^}]*skipAuthRedirect:\s*true/s);
  assert.match(source, /apiFetch\('\/api\/subscription',\s*\{\s*skipAuthRedirect:\s*true/);
  assert.match(source, /apiFetch\('\/api\/credits',\s*\{\s*skipAuthRedirect:\s*true/);
  assert.match(source, /AbortController/);
});
