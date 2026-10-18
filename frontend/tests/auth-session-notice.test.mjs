import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { clearAllSessionData, rememberSession, SESSION_UPDATED_EVENT } from '../src/lib/session.js';

function mockStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, value); },
    removeItem: (key) => { map.delete(key); },
  };
}

afterEach(() => {
  clearAllSessionData();
  delete globalThis.localStorage;
  delete globalThis.sessionStorage;
});

test('verified session clears stale auth expiration notice storage', () => {
  const storage = mockStorage();
  globalThis.localStorage = storage;
  globalThis.sessionStorage = storage;
  const listeners = new Map();
  globalThis.addEventListener = (type, handler) => {
    listeners.set(type, handler);
  };
  globalThis.removeEventListener = (type) => {
    listeners.delete(type);
  };
  globalThis.dispatchEvent = (event) => {
    listeners.get(event.type)?.(event);
    return true;
  };
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };

  storage.setItem('allmodelai_auth_notice', 'Your session has expired. Please sign in again.');

  let updated = false;
  const onUpdated = (event) => {
    if (event.detail?.user?.email) updated = true;
  };
  globalThis.addEventListener(SESSION_UPDATED_EVENT, onUpdated);
  rememberSession({ id: 1, email: 'ok@example.com', name: 'Ok' }, { serverVerified: true });
  globalThis.removeEventListener(SESSION_UPDATED_EVENT, onUpdated);

  assert.equal(storage.getItem('allmodelai_auth_notice'), null);
  assert.equal(updated, true);
});
