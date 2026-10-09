import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  clearAllSessionData,
  isLogoutInProgress,
  performLogout,
  rememberSession,
  restoreSession,
} from '../src/lib/session.js';

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
});

test('performLogout calls backend logout with credentials and clears session', async () => {
  installStorage();
  rememberSession({ id: 1, name: 'Tester', email: 'tester@example.com' });
  let logoutUrl = '';
  globalThis.fetch = async (url, options) => {
    logoutUrl = String(url);
    assert.equal(options.method, 'POST');
    assert.equal(options.credentials, 'include');
    return { ok: true, status: 204 };
  };

  const result = await performLogout();
  assert.equal(result.ok, true);
  assert.match(logoutUrl, /\/api\/auth\/logout$/);
  assert.equal(globalThis.localStorage.getItem('allmodelai_user'), null);
  assert.equal(isLogoutInProgress(), false);
});

test('performLogout treats missing session (401) as successful sign-out', async () => {
  installStorage();
  rememberSession({ id: 2, name: 'Tester', email: 'gone@example.com' });
  globalThis.fetch = async () => ({ ok: false, status: 401 });

  await performLogout();
  assert.equal(globalThis.localStorage.getItem('allmodelai_user'), null);
});

test('performLogout surfaces real server failures without clearing session', async () => {
  installStorage();
  rememberSession({ id: 3, name: 'Tester', email: 'fail@example.com' });
  globalThis.fetch = async () => ({ ok: false, status: 503 });

  await assert.rejects(() => performLogout(), /Could not sign out/);
  assert.ok(globalThis.localStorage.getItem('allmodelai_user'));
});

test('session cleared event lets restoreSession return null after logout', async () => {
  installStorage();
  rememberSession({ id: 4, name: 'Tester', email: 'event@example.com' });
  globalThis.fetch = async (url) => {
    if (String(url).includes('/logout')) return jsonResponse(204, null);
    return jsonResponse(401, { message: 'Unauthorized' });
  };

  await performLogout();
  const user = await restoreSession({ force: true });
  assert.equal(user, null);
});

test('home navbar opens Sign In modal only from explicit button clicks', () => {
  const navbar = readFileSync(`${root}src/components/Navbar/Navbar.jsx`, 'utf8');
  const navAuth = readFileSync(`${root}src/components/Navbar/NavAuthSection.jsx`, 'utf8');
  assert.match(navbar, /onOpenAuth=\{setAuthMode\}/);
  assert.match(navAuth, /onOpenAuth\('signin'\)/);
  assert.doesNotMatch(navbar, /signedOut/);
});

test('logout navigation targets public home, not login modal route', () => {
  const nav = readFileSync(`${root}src/components/Dashboard/DashboardWorkspaceNav.jsx`, 'utf8');
  const settings = readFileSync(`${root}src/components/Settings/Settings.jsx`, 'utf8');
  const requireAuth = readFileSync(`${root}src/components/Login/RequireAuth.jsx`, 'utf8');

  assert.match(nav, /navigate\('\/', \{ replace: true \}\)/);
  assert.doesNotMatch(nav, /navigate\('\/login'/);
  assert.match(settings, /navigate\('\/', \{ replace: true \}\)/);
  assert.doesNotMatch(settings, /navigate\('\/login'/);
  assert.match(requireAuth, /to="\/login"/);
  assert.doesNotMatch(requireAuth, /signedOut: true/);
});

test('login → logout → login cycle clears and restores session hints', async () => {
  installStorage();
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes('/logout')) return jsonResponse(204, null);
    if (String(url).includes('/session')) {
      const saved = globalThis.localStorage.getItem('allmodelai_user');
      return saved
        ? jsonResponse(200, { user: JSON.parse(saved) })
        : jsonResponse(401, { message: 'Unauthorized' });
    }
    return jsonResponse(404, { message: 'Not found' });
  };

  rememberSession({ id: 10, name: 'Cycle', email: 'cycle@example.com' });
  await performLogout();
  assert.equal(await restoreSession({ force: true }), null);

  rememberSession({ id: 11, name: 'Cycle', email: 'cycle@example.com' });
  const again = await restoreSession({ force: true });
  assert.equal(again.email, 'cycle@example.com');

  await performLogout();
  assert.equal(await restoreSession({ force: true }), null);
  assert.ok(calls.filter((url) => url.includes('/logout')).length >= 2);
});

test('clearAllSessionData removes cached user without touching unrelated keys', () => {
  const storage = installStorage();
  storage.setItem('allmodelai_user', JSON.stringify({ email: 'x@y.com' }));
  storage.setItem('unrelated', 'keep');
  clearAllSessionData();
  assert.equal(storage.getItem('allmodelai_user'), null);
  assert.equal(storage.getItem('unrelated'), 'keep');
});
