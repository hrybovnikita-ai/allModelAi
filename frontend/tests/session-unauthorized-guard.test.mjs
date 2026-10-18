import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  clearAllSessionData,
  confirmSession,
  isSessionUserVerified,
  markFreshLogin,
  readStoredSessionUser,
  rememberSession,
  restoreSession,
} from '../src/lib/session.js';
import {
  handleUnauthorizedApiResponse,
  resetUnauthorizedRedirectGuard,
} from '../src/lib/clientAuthReset.js';

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
  resetUnauthorizedRedirectGuard();
  clearAllSessionData();
  delete globalThis.localStorage;
  delete globalThis.sessionStorage;
  delete globalThis.fetch;
  delete globalThis.document;
  delete globalThis.location;
});

test('stale guest session probe cannot clear a newer confirmed login', async () => {
  installStorage();
  globalThis.document = { cookie: 'allmodelai_cookie_consent=accepted' };

  let resolveGuest;
  const guestGate = new Promise((resolve) => { resolveGuest = resolve; });
  let sessionCalls = 0;

  globalThis.fetch = async (url) => {
    if (!String(url).includes('/api/auth/session')) {
      return jsonResponse(200, {});
    }
    sessionCalls += 1;
    if (sessionCalls === 1) {
      await guestGate;
      return jsonResponse(200, { authenticated: false, user: null });
    }
    return jsonResponse(200, {
      authenticated: true,
      user: { id: 15, email: 'google-user@example.com', name: 'Google User' },
    });
  };

  const stale = restoreSession({ force: true });
  const confirmed = await confirmSession({
    id: 15,
    email: 'google-user@example.com',
    name: 'Google User',
  });

  assert.equal(confirmed.email, 'google-user@example.com');
  assert.equal(isSessionUserVerified(confirmed), true);

  resolveGuest();
  await assert.rejects(stale, /Session changed/);

  assert.equal(readStoredSessionUser()?.email, 'google-user@example.com');
  assert.equal(isSessionUserVerified(confirmed), true);
  assert.ok(sessionCalls >= 2);
});

test('analytics 401 does not force logout when /api/auth/session still succeeds', async () => {
  installStorage();
  globalThis.document = { cookie: 'allmodelai_cookie_consent=accepted' };
  const user = { id: 15, email: 'still-signed-in@example.com', name: 'Still In' };
  rememberSession(user);
  markFreshLogin();

  let assigned = null;
  globalThis.location = {
    pathname: '/dashboard',
    search: '',
    assign(target) { assigned = target; },
  };

  globalThis.fetch = async (url) => {
    assert.match(String(url), /\/api\/auth\/session/);
    return jsonResponse(200, { authenticated: true, user });
  };

  const redirected = await handleUnauthorizedApiResponse('/api/analytics');
  assert.equal(redirected, false);
  assert.equal(assigned, null);
  assert.equal(readStoredSessionUser()?.email, user.email);
  assert.equal(globalThis.sessionStorage.getItem('allmodelai_auth_notice'), null);
});

test('definitive session expiry still signs out after unauthorized API response', async () => {
  installStorage();
  globalThis.document = { cookie: 'allmodelai_cookie_consent=accepted' };
  rememberSession({ id: 9, email: 'expired@example.com', name: 'Expired' });

  let assigned = null;
  globalThis.location = {
    pathname: '/dashboard',
    search: '',
    assign(target) { assigned = target; },
  };

  // No fresh-login grace — guest after retries is definitive.
  globalThis.fetch = async () => jsonResponse(200, { authenticated: false, user: null });

  const redirected = await handleUnauthorizedApiResponse('/api/credits');
  assert.equal(redirected, true);
  assert.equal(assigned, '/');
  assert.match(
    String(globalThis.sessionStorage.getItem('allmodelai_auth_notice') || ''),
    /session has expired/i,
  );
  assert.equal(readStoredSessionUser(), null);
});

test('fresh-login grace blocks logout when session probe is still empty', async () => {
  installStorage();
  globalThis.document = { cookie: 'allmodelai_cookie_consent=accepted' };
  rememberSession({ id: 3, email: 'grace@example.com', name: 'Grace' }, { serverVerified: false });
  markFreshLogin();

  let assigned = null;
  globalThis.location = {
    pathname: '/dashboard',
    search: '',
    assign(target) { assigned = target; },
  };

  globalThis.fetch = async () => jsonResponse(200, { authenticated: false, user: null });

  const redirected = await handleUnauthorizedApiResponse('/api/subscription');
  assert.equal(redirected, false);
  assert.equal(assigned, null);
  assert.equal(readStoredSessionUser()?.email, 'grace@example.com');
  assert.equal(globalThis.sessionStorage.getItem('allmodelai_auth_notice'), null);
});
