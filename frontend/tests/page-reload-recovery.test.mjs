import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AUTH_STATUS } from '../src/lib/authSessionStatus.js';
import { resetSessionRestoreMetaForTests } from '../src/lib/sessionRestoreMeta.js';
import { restoreSession } from '../src/lib/session.js';
import { consumeSessionRestoreMeta } from '../src/lib/sessionRestoreMeta.js';

const root = fileURLToPath(new URL('../', import.meta.url));

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
  resetSessionRestoreMetaForTests();
});

test('restoreSession returns cached profile without verifying when backend is unreachable', async () => {
  installStorage();
  globalThis.localStorage.setItem(
    'allmodelai_user',
    JSON.stringify({ email: 'reload@example.com', name: 'Reload' }),
  );
  globalThis.document = { cookie: 'allmodelai_cookie_consent=accepted' };
  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };

  const user = await restoreSession({ force: true });
  assert.equal(user?.email, 'reload@example.com');
  const meta = consumeSessionRestoreMeta();
  assert.equal(meta.verified, false);
  assert.equal(meta.issue?.code, 'BACKEND_UNREACHABLE');
});

test('restoreSession still clears session on HTTP 401', async () => {
  installStorage();
  globalThis.localStorage.setItem(
    'allmodelai_user',
    JSON.stringify({ email: 'stale@example.com', name: 'Stale' }),
  );
  globalThis.document = { cookie: 'allmodelai_cookie_consent=accepted' };
  globalThis.fetch = async () => jsonResponse(401, { message: 'No active session' });

  const user = await restoreSession({ force: true });
  assert.equal(user, null);
  assert.equal(globalThis.localStorage.getItem('allmodelai_user'), null);
});

test('restoreSession retries then succeeds on slow backend startup', async () => {
  installStorage();
  globalThis.document = { cookie: 'allmodelai_cookie_consent=accepted' };
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls < 3) throw new TypeError('Failed to fetch');
    return jsonResponse(200, { user: { email: 'slow@example.com', name: 'Slow' } });
  };

  const user = await restoreSession({ force: true });
  assert.ok(calls >= 3);
  assert.equal(user?.email, 'slow@example.com');
  assert.equal(consumeSessionRestoreMeta().verified, true);
});

test('restoreSession degrades on HTTP 500 when client hint exists', async () => {
  installStorage();
  globalThis.localStorage.setItem(
    'allmodelai_user',
    JSON.stringify({ email: 'hint@example.com', name: 'Hint' }),
  );
  globalThis.document = { cookie: 'allmodelai_cookie_consent=accepted' };
  globalThis.fetch = async () => jsonResponse(500, { message: 'Internal error' });

  const user = await restoreSession({ force: true });
  assert.equal(user?.email, 'hint@example.com');
  assert.equal(consumeSessionRestoreMeta().verified, false);
});

test('RequireAuth keeps protected shell for connection-issue state', () => {
  const requireAuth = readFileSync(`${root}src/components/Login/RequireAuth.jsx`, 'utf8');
  assert.match(requireAuth, /CONNECTION_ISSUE/);
  assert.match(requireAuth, /<Outlet/);
  assert.doesNotMatch(requireAuth, /protectedSessionProbe/);
});

test('SessionProvider exposes connection issue without full-page auth error when user exists', () => {
  const provider = readFileSync(`${root}src/components/Session/SessionProvider.jsx`, 'utf8');
  assert.match(provider, /CONNECTION_ISSUE/);
  assert.match(provider, /connectionIssue/);
  assert.match(provider, /sessionVerified/);
});

test('auth status includes connection-issue for degraded reload', () => {
  assert.equal(AUTH_STATUS.CONNECTION_ISSUE, 'connection-issue');
});
