import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

test('RequireAuth waits for authLoading before anonymous redirect', async () => {
  const source = await readFile(
    new URL('../src/components/Login/RequireAuth.jsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /authLoading/);
  const authLoadingGuard = source.indexOf('showAuthSkeleton');
  const anonymousGuard = source.indexOf('AUTH_STATUS.UNAUTHENTICATED');
  assert.ok(authLoadingGuard > 0 && anonymousGuard > authLoadingGuard);
});

test('NavAuthSection shows loading before Sign in when authLoading', async () => {
  const source = await readFile(
    new URL('../src/components/Navbar/NavAuthSection.jsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /authLoading/);
  assert.match(source, /AUTH_STATUS\.AUTHENTICATED/);
  assert.match(source, /CHECKING_REDIRECT/);
  assert.match(source, /AUTH_REDIRECT_RECOVERY_TIMEOUT_MS/);
});
