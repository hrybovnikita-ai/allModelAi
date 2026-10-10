import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import {
  REDIRECT_PENDING_KEY,
  clearSocialRedirectIntent,
  hasFirebaseRedirectReturnHints,
  isGoogleRedirectRecoveryPending,
  markRedirectFlowCommitted,
  persistRedirectIntent,
  reconcileStaleRedirectIntent,
  shouldShowGoogleRedirectRecoveryUI,
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

  clear() {
    this.store.clear();
  }
}

beforeEach(() => {
  globalThis.sessionStorage = new MemoryStorage();
  globalThis.localStorage = new MemoryStorage();
});

afterEach(() => {
  clearSocialRedirectIntent();
  delete globalThis.sessionStorage;
  delete globalThis.localStorage;
});

test('redirect intent stores challenge state for Safari return', () => {
  persistRedirectIntent('Google', { challengeState: 'f'.repeat(64) }, 'awaiting-google-return');
  const raw = globalThis.sessionStorage.getItem('allmodelai_social_redirect');
  assert.equal(JSON.parse(raw).challengeState, 'f'.repeat(64));
});

test('redirect recovery pending requires committed redirect flag', () => {
  persistRedirectIntent('Google', {}, 'awaiting-google-return');
  assert.equal(isGoogleRedirectRecoveryPending(), false);
  markRedirectFlowCommitted();
  assert.equal(isGoogleRedirectRecoveryPending(), true);
});

test('stale awaiting-google intent without redirect flag is cleared', () => {
  persistRedirectIntent('Google', {}, 'awaiting-google-return');
  reconcileStaleRedirectIntent();
  assert.equal(isGoogleRedirectRecoveryPending(), false);
});

test('redirect pending key matches Safari fallback contract', () => {
  assert.equal(REDIRECT_PENDING_KEY, 'allmodelai_redirect_pending');
});

test('stale redirect intent outside recovery window is cleared on reconcile', () => {
  persistRedirectIntent('Google', {}, 'awaiting-google-return');
  markRedirectFlowCommitted();
  const raw = globalThis.sessionStorage.getItem('allmodelai_social_redirect');
  const parsed = JSON.parse(raw);
  parsed.redirectStartedAt = Date.now() - 600000;
  parsed.expires = Date.now() + 600000;
  const stale = JSON.stringify(parsed);
  globalThis.sessionStorage.setItem('allmodelai_social_redirect', stale);
  globalThis.localStorage.setItem('allmodelai_social_redirect_backup', stale);
  globalThis.window = { location: { pathname: '/', search: '', hash: '' } };
  reconcileStaleRedirectIntent();
  assert.equal(isGoogleRedirectRecoveryPending(), false);
  delete globalThis.window;
});

test('shouldShowGoogleRedirectRecoveryUI requires pending flag or OAuth URL hints', () => {
  persistRedirectIntent('Google', {}, 'awaiting-google-return');
  markRedirectFlowCommitted();
  globalThis.window = { location: { pathname: '/', search: '', hash: '' } };
  assert.equal(shouldShowGoogleRedirectRecoveryUI(), true);
  delete globalThis.window;
});

test('login launches popup synchronously before awaits', async () => {
  const { readFile } = await import('node:fs/promises');
  const login = await readFile(new URL('../src/components/Login/Login.jsx', import.meta.url), 'utf8');
  const signIn = await readFile(new URL('../src/lib/socialSignIn.js', import.meta.url), 'utf8');
  assert.match(login, /shouldPreferGoogleRedirectSignIn/);
  assert.match(login, /startGoogleRedirectSignIn/);
  assert.match(login, /launchGooglePopupSignIn\(\)/);
  assert.match(signIn, /export function launchGooglePopupSignIn/);
  assert.match(signIn, /signInWithPopup\(auth, provider\)/);
  assert.match(signIn, /markRedirectFlowCommitted/);
});
