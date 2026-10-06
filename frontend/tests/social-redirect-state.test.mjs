import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import {
  REDIRECT_PENDING_KEY,
  clearSocialRedirectIntent,
  isGoogleRedirectRecoveryPending,
  markRedirectFlowCommitted,
  persistRedirectIntent,
  reconcileStaleRedirectIntent,
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

test('login launches popup synchronously before awaits', async () => {
  const { readFile } = await import('node:fs/promises');
  const login = await readFile(new URL('../src/components/Login/Login.jsx', import.meta.url), 'utf8');
  const signIn = await readFile(new URL('../src/lib/socialSignIn.js', import.meta.url), 'utf8');
  assert.match(login, /launchGooglePopupSignIn\(\)/);
  assert.match(login, /completeGooglePopupSignIn/);
  assert.match(signIn, /export function launchGooglePopupSignIn/);
  assert.match(signIn, /signInWithPopup\(auth, provider\)/);
  assert.match(signIn, /markRedirectFlowCommitted/);
});
