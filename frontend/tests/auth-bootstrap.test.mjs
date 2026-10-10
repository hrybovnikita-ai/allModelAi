import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { afterEach, test } from 'node:test';
import { resetAuthBootstrapForTests } from '../src/lib/authBootstrap.js';

afterEach(() => {
  resetAuthBootstrapForTests();
});

test('auth bootstrap dedupes in-flight work but does not cache null forever', async () => {
  const source = await readFile(new URL('../src/lib/authBootstrap.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /bootstrapPromise\s*=\s*runBootstrap/);
  assert.match(source, /bootstrapInflight/);
  assert.match(source, /bootstrapInflight = null/);
  assert.match(source, /fresh-login-or-popup/);
});

test('session provider preserves authenticated user during fresh-login grace', async () => {
  const source = await readFile(
    new URL('../src/components/Session/SessionProvider.jsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /SESSION_PROVIDER_PRESERVED/);
  assert.match(source, /isFreshLoginGraceActive/);
});

test('login refreshes session before dashboard navigation', async () => {
  const login = await readFile(new URL('../src/components/Login/Login.jsx', import.meta.url), 'utf8');
  const blockStart = login.indexOf('const outcome = await completeGooglePopupSignIn');
  assert.ok(blockStart > 0);
  const block = login.slice(blockStart, blockStart + 500);
  const refreshIndex = block.indexOf('refresh({ force: true })');
  const navIndex = block.indexOf('navigateAfterSocialLogin');
  assert.ok(refreshIndex > 0 && navIndex > refreshIndex, 'refresh must run before navigateAfterSocialLogin');
});

test('social exchange establishes session atomically after POST firebase', async () => {
  const social = await readFile(new URL('../src/lib/socialSession.js', import.meta.url), 'utf8');
  const session = await readFile(new URL('../src/lib/session.js', import.meta.url), 'utf8');
  assert.match(social, /establishSessionFromAuthExchange/);
  assert.match(session, /SESSION_EXCHANGE_STORED/);
  assert.match(session, /export async function establishSessionFromAuthExchange/);
});

test('login exposes explicit Retry for retryable Google network errors', async () => {
  const login = await readFile(new URL('../src/components/Login/Login.jsx', import.meta.url), 'utf8');
  assert.match(login, /isRetryableSocialSignInError/);
  assert.match(login, /Retry Google sign-in/);
});

test('bootstrap can be invalidated after social exchange', async () => {
  const bootstrap = await readFile(new URL('../src/lib/authBootstrap.js', import.meta.url), 'utf8');
  const signIn = await readFile(new URL('../src/lib/socialSignIn.js', import.meta.url), 'utf8');
  assert.match(bootstrap, /invalidateAuthBootstrap/);
  assert.match(signIn, /invalidateAuthBootstrap\(\)/);
});

test('auth page redirects authenticated users away from login', async () => {
  const authPage = await readFile(new URL('../src/components/Login/AuthPage.jsx', import.meta.url), 'utf8');
  assert.match(authPage, /AUTH_STATUS\.AUTHENTICATED/);
  assert.match(authPage, /navigate\(returnTo/);
});
