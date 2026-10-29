import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { afterEach, test } from 'node:test';
import { resetAuthBootstrapForTests } from '../src/lib/authBootstrap.js';

afterEach(() => {
  resetAuthBootstrapForTests();
});

test('auth bootstrap dedupes in-flight work but does not cache null forever', async () => {
  const bootstrap = await readFile(new URL('../src/lib/authBootstrap.js', import.meta.url), 'utf8');
  const state = await readFile(new URL('../src/lib/authBootstrapState.js', import.meta.url), 'utf8');
  assert.doesNotMatch(bootstrap, /bootstrapPromise\s*=\s*runBootstrap/);
  assert.match(bootstrap, /getAuthBootstrapInflight|setAuthBootstrapInflight/);
  assert.match(state, /invalidateAuthBootstrap/);
  assert.match(bootstrap, /fresh-login-or-popup/);
});

test('session provider requires server proof even during fresh-login grace', async () => {
  const source = await readFile(
    new URL('../src/components/Session/SessionProvider.jsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /SESSION_PROVIDER_PRESERVED/);
  assert.match(source, /isSessionUserVerified\(user\)/);
  assert.match(source, /isFreshLoginGraceActive\(\) && current\.user\?\.email && current\.sessionVerified/);
  assert.match(source, /!hasSessionRestoreHint\(\) && !isFreshLoginGraceActive\(\)/);
});

test('login refreshes session before dashboard navigation', async () => {
  const login = await readFile(new URL('../src/components/Login/Login.jsx', import.meta.url), 'utf8');
  const blockStart = login.indexOf('const outcome = await completeGooglePopupSignIn');
  assert.ok(blockStart > 0);
  const block = login.slice(blockStart, blockStart + 700);
  const refreshIndex = block.indexOf('refresh({ force: true, silent: true })');
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

test('login retries the selected social provider after network errors', async () => {
  const login = await readFile(new URL('../src/components/Login/Login.jsx', import.meta.url), 'utf8');
  assert.match(login, /isRetryableSocialSignInError/);
  assert.match(login, /Retry \{lastSocialProvider\} sign-in/);
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
