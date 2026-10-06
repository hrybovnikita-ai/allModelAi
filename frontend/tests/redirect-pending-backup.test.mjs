import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  clearSocialRedirectIntent,
  isGoogleRedirectRecoveryPending,
  isRedirectFlowCommitted,
  markRedirectFlowCommitted,
  persistRedirectIntent,
} from '../src/lib/socialRedirectState.js';

const sessionStorage = new Map();
const localStorage = new Map();

function mockStorage() {
  globalThis.sessionStorage = {
    getItem: (k) => sessionStorage.get(k) ?? null,
    setItem: (k, v) => sessionStorage.set(k, v),
    removeItem: (k) => sessionStorage.delete(k),
  };
  globalThis.localStorage = {
    getItem: (k) => localStorage.get(k) ?? null,
    setItem: (k, v) => localStorage.set(k, v),
    removeItem: (k) => localStorage.delete(k),
  };
}

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  delete globalThis.sessionStorage;
  delete globalThis.localStorage;
});

test('redirect recovery pending when sessionStorage pending flag lost but localStorage backup remains', () => {
  mockStorage();
  persistRedirectIntent('Google', { rememberMe: true }, 'awaiting-google-return');
  markRedirectFlowCommitted();
  sessionStorage.delete('allmodelai_redirect_pending');
  assert.equal(isRedirectFlowCommitted(), true);
  assert.equal(isGoogleRedirectRecoveryPending(), true);
  clearSocialRedirectIntent();
  assert.equal(isGoogleRedirectRecoveryPending(), false);
});
