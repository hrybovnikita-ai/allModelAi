import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  clearAllSessionData,
  isFreshLoginGraceActive,
  markFreshLogin,
  restoreSession,
} from '../src/lib/session.js';

function mockStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, value); },
    removeItem: (key) => { map.delete(key); },
  };
}

function installStorage() {
  const storage = mockStorage();
  globalThis.localStorage = storage;
  globalThis.sessionStorage = storage;
  return storage;
}

function jsonResponse(status, data) {
  const body = data == null ? '' : JSON.stringify(data);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (String(name).toLowerCase() === 'content-type' ? 'application/json' : '') },
    text: async () => body,
    json: async () => data,
  };
}

afterEach(() => {
  delete globalThis.localStorage;
  delete globalThis.sessionStorage;
  delete globalThis.fetch;
  delete globalThis.window;
});

test('fresh login grace keeps stored user when session endpoint returns 401 during Safari bootstrap', async () => {
  installStorage();
  globalThis.localStorage.setItem(
    'allmodelai_user',
    JSON.stringify({ email: 'ipad@example.com', name: 'iPad User' }),
  );
  markFreshLogin();
  assert.equal(isFreshLoginGraceActive(), true);

  globalThis.window = {
    location: {
      protocol: 'https:',
      hostname: 'all-model-ai.com',
      origin: 'https://all-model-ai.com',
      port: '',
    },
  };

  let calls = 0;
  globalThis.fetch = async (url) => {
    calls += 1;
    assert.match(String(url), /\/api\/auth\/session$/);
    return jsonResponse(401, { message: 'Unauthorized' });
  };

  const user = await restoreSession({ force: true });
  assert.ok(calls >= 1);
  assert.equal(user?.email, 'ipad@example.com');
  assert.ok(globalThis.localStorage.getItem('allmodelai_user'));
});

test('logout clears fresh login grace marker', () => {
  installStorage();
  markFreshLogin();
  clearAllSessionData();
  assert.equal(isFreshLoginGraceActive(), false);
});
