import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, test } from 'node:test';
import {
  IOS_AUTH_STATE_FALLBACK_TIMEOUT_MS,
  IOS_LATE_REDIRECT_GRACE_MS,
  IOS_REDIRECT_RESULT_TIMEOUT_MS,
} from '../src/lib/firebaseRedirectCoordinator.js';
import { resetAuthBootstrapForTests } from '../src/lib/authBootstrap.js';
import {
  clearSocialRedirectIntent,
  markRedirectFlowCommitted,
  persistRedirectIntent,
} from '../src/lib/socialRedirectState.js';

class MemoryStorage {
  constructor() {
    this.store = new Map();
  }

  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }

  setItem(key, value) {
    this.store.set(key, String(value));
  }

  removeItem(key) {
    this.store.delete(key);
  }
}

beforeEach(() => {
  globalThis.sessionStorage = new MemoryStorage();
  globalThis.localStorage = new MemoryStorage();
  globalThis.window = { location: { pathname: '/login', search: '', hash: '' } };
  resetAuthBootstrapForTests();
});

afterEach(() => {
  clearSocialRedirectIntent();
  delete globalThis.sessionStorage;
  delete globalThis.localStorage;
  delete globalThis.window;
});

test('iOS redirect waits are long enough for WebKit OAuth return', () => {
  assert.ok(IOS_REDIRECT_RESULT_TIMEOUT_MS >= 10000);
  assert.ok(IOS_AUTH_STATE_FALLBACK_TIMEOUT_MS >= 5000);
  assert.ok(IOS_LATE_REDIRECT_GRACE_MS >= 2000);
});

test('redirect intent persists challenge state for post-redirect exchange', () => {
  persistRedirectIntent('Google', { rememberMe: true, challengeState: 'a'.repeat(64) }, 'awaiting-google-return');
  markRedirectFlowCommitted();
  const raw = globalThis.sessionStorage.getItem('allmodelai_social_redirect');
  const parsed = JSON.parse(raw);
  assert.equal(parsed.challengeState, 'a'.repeat(64));
});

test('auth bootstrap defers recovery while redirect is still pending on iOS', async () => {
  const bootstrap = await readFile(new URL('../src/lib/authBootstrap.js', import.meta.url), 'utf8');
  assert.match(bootstrap, /Deferring Google redirect recovery to gate/);
  assert.match(bootstrap, /shouldAttemptGoogleRedirectRecovery/);
});

test('social redirect recovery always mints a fresh backend challenge after Safari return', async () => {
  const signIn = await readFile(new URL('../src/lib/socialSignIn.js', import.meta.url), 'utf8');
  assert.match(signIn, /BACKEND_CHALLENGE_AFTER_REDIRECT/);
  assert.match(signIn, /prepareBackendChallenge\(options\)/);
  assert.doesNotMatch(signIn, /pending\.challengeState/);
});

test('google redirect recovery does not cache a skipped null promise', async () => {
  const recovery = await readFile(new URL('../src/lib/googleRedirectRecovery.js', import.meta.url), 'utf8');
  assert.doesNotMatch(recovery, /bootstrapPromise = Promise\.resolve\(null\)/);
  assert.match(recovery, /bootstrapPromise = null/);
  assert.match(recovery, /isGoogleRedirectRecoveryInFlight/);
});

test('recovery gate surfaces failures instead of silent guest state', async () => {
  const gate = await readFile(new URL('../src/components/SocialAuth/GoogleRedirectRecoveryGate.jsx', import.meta.url), 'utf8');
  assert.match(gate, /consumeStoredSocialAuthError/);
  assert.match(gate, /Sign-in incomplete/);
  assert.match(gate, /refresh\(\{ force: true \}\)/);
});

test('session provider and navbar defer guest UI during redirect recovery', async () => {
  const sessionProvider = await readFile(new URL('../src/components/Session/SessionProvider.jsx', import.meta.url), 'utf8');
  const navbar = await readFile(new URL('../src/components/Navbar/NavAuthSection.jsx', import.meta.url), 'utf8');
  assert.match(sessionProvider, /SESSION_PROVIDER_INIT_TIMEOUT_DEFERRED/);
  assert.match(sessionProvider, /authBootstrapTimeoutMs/);
  assert.match(navbar, /redirectRecoveryActive/);
  assert.match(navbar, /AUTH_REDIRECT_RECOVERY_TIMEOUT_MS/);
});

test('social session marks fresh login before confirmSession (Safari cookie propagation)', async () => {
  const socialSession = await readFile(new URL('../src/lib/socialSession.js', import.meta.url), 'utf8');
  const session = await readFile(new URL('../src/lib/session.js', import.meta.url), 'utf8');
  assert.match(socialSession, /markFreshLogin\(\)/);
  assert.match(session, /getNativeSessionToken\(\)/);
  assert.match(session, /markFreshLogin\(\)/);
});

test('redirect reconcile is blocked while recovery pipeline runs', async () => {
  const {
    setRedirectIntentReconcileBlocked,
    isRedirectIntentReconcileBlocked,
    reconcileStaleRedirectIntent,
    persistRedirectIntent,
    markRedirectFlowCommitted,
  } = await import('../src/lib/socialRedirectState.js');
  persistRedirectIntent('Google', {}, 'awaiting-google-return');
  markRedirectFlowCommitted();
  setRedirectIntentReconcileBlocked(true);
  assert.equal(isRedirectIntentReconcileBlocked(), true);
  reconcileStaleRedirectIntent();
  assert.notEqual(
    globalThis.sessionStorage.getItem('allmodelai_social_redirect'),
    null,
    'must not clear while blocked',
  );
  setRedirectIntentReconcileBlocked(false);
});

test('vercel config keeps /auth/callback on the SPA (no backend rewrite)', async () => {
  const vercel = await readFile(new URL('../vercel.json', import.meta.url), 'utf8');
  assert.doesNotMatch(vercel, /"source": "\/auth\/:path\*"/);
  assert.match(vercel, /"source": "\/api\/:path\*"/);
});
