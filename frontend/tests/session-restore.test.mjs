import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { restoreSession } from '../src/lib/session.js';

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
});

test('restoreSession retries on 401 for mobile Safari before clearing stored user', async () => {
  installStorage();
  globalThis.localStorage.setItem(
    'allmodelai_user',
    JSON.stringify({ email: 'safari@example.com', name: 'Safari User' }),
  );
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  });

  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return jsonResponse(401, { message: 'Unauthorized' });
  };

  const user = await restoreSession({ force: true });
  assert.ok(calls >= 3);
  assert.equal(user?.email, 'safari@example.com');
  assert.ok(globalThis.localStorage.getItem('allmodelai_user'));
});
