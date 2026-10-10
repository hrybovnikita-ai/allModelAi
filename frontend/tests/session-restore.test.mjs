import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { fetchSessionFromServer, restoreSession } from '../src/lib/session.js';

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
  delete globalThis.document;
});

test('restoreSession probes the backend even without a client restore hint (HttpOnly cookie)', async () => {
  installStorage();
  globalThis.document = { cookie: 'allmodelai_cookie_consent=accepted' };
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return jsonResponse(401, { message: 'No active session' });
  };

  const user = await restoreSession();
  assert.equal(calls, 1);
  assert.equal(user, null);
});

test('restoreSession restores user from server when cookie is valid but local hint is missing', async () => {
  installStorage();
  globalThis.document = { cookie: 'allmodelai_cookie_consent=accepted' };
  globalThis.fetch = async () =>
    jsonResponse(200, { user: { email: 'cookie-only@example.com', name: 'Cookie' } });

  const user = await restoreSession();
  assert.equal(user?.email, 'cookie-only@example.com');
  assert.match(globalThis.localStorage.getItem('allmodelai_user'), /cookie-only@example.com/);
});

test('restoreSession treats 401 as signed out and clears stale client hint', async () => {
  installStorage();
  globalThis.localStorage.setItem(
    'allmodelai_user',
    JSON.stringify({ email: 'stale@example.com', name: 'Stale' }),
  );
  globalThis.document = { cookie: 'allmodelai_cookie_consent=accepted' };

  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return jsonResponse(401, { message: 'No active session' });
  };

  const user = await restoreSession({ force: true });
  assert.equal(calls, 1);
  assert.equal(user, null);
  assert.equal(globalThis.localStorage.getItem('allmodelai_user'), null);
});

test('restoreSession treats 200 guest payload as signed out', async () => {
  installStorage();
  globalThis.localStorage.setItem(
    'allmodelai_user',
    JSON.stringify({ email: 'stale@example.com', name: 'Stale' }),
  );
  globalThis.document = { cookie: 'allmodelai_cookie_consent=accepted' };

  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return jsonResponse(200, { user: null, authenticated: false });
  };

  const user = await restoreSession({ force: true });
  assert.equal(calls, 1);
  assert.equal(user, null);
  assert.equal(globalThis.localStorage.getItem('allmodelai_user'), null);
});

test('restoreSession retries on 401 only during fresh-login grace', async () => {
  installStorage();
  globalThis.localStorage.setItem('allmodelai_fresh_login', String(Date.now()));
  globalThis.document = { cookie: 'allmodelai_cookie_consent=accepted' };

  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls < 2) return jsonResponse(401, { message: 'No active session' });
    return jsonResponse(200, { user: { email: 'ok@example.com', name: 'Ok' } });
  };

  const user = await restoreSession({ force: true });
  assert.ok(calls >= 2);
  assert.equal(user?.email, 'ok@example.com');
});

test('fetchSessionFromServer returns parsed session response', async () => {
  globalThis.document = { cookie: 'allmodelai_cookie_consent=accepted' };
  globalThis.fetch = async (url) => {
    assert.match(String(url), /\/api\/auth\/session$/);
    return jsonResponse(200, { user: { email: 'probe@example.com', name: 'Probe' } });
  };
  const { response, data } = await fetchSessionFromServer();
  assert.equal(response.status, 200);
  assert.equal(data.user.email, 'probe@example.com');
});
