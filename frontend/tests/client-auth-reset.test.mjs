import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { rememberSession } from '../src/lib/session.js';

function mockStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, value); },
    removeItem: (key) => { map.delete(key); },
  };
}

afterEach(async () => {
  const { resetUnauthorizedRedirectGuard } = await import('../src/lib/clientAuthReset.js');
  resetUnauthorizedRedirectGuard();
  delete globalThis.localStorage;
  delete globalThis.sessionStorage;
  delete globalThis.fetch;
  delete globalThis.window;
});

test('deleteUserAccountAndSignOut purges session on 401', async () => {
  globalThis.localStorage = mockStorage();
  globalThis.sessionStorage = mockStorage();
  rememberSession({ id: 1, name: 'Del', email: 'del@example.com' });

  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /\/api\/auth\/account$/);
    assert.equal(options.method, 'DELETE');
    return {
      ok: false,
      status: 401,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ message: 'Unauthorized' }),
      json: async () => ({ message: 'Unauthorized' }),
    };
  };

  const { deleteUserAccountAndSignOut } = await import('../src/lib/clientAuthReset.js');
  const result = await deleteUserAccountAndSignOut('del@example.com');
  assert.equal(result.deleted, false);
  assert.match(result.message, /session expired/i);
  assert.equal(globalThis.localStorage.getItem('allmodelai_user'), null);
});

test('apiFetch triggers unauthorized redirect for dashboard 401', async () => {
  globalThis.localStorage = mockStorage();
  globalThis.sessionStorage = mockStorage();
  rememberSession({ id: 2, name: 'Dash', email: 'dash@example.com' });

  let assigned = '';
  globalThis.window = {
    location: {
      pathname: '/dashboard',
      search: '',
      assign: (url) => { assigned = url; },
    },
  };

  globalThis.fetch = async () => ({
    ok: false,
    status: 401,
    statusText: 'Unauthorized',
    headers: { get: () => '' },
    text: async () => '',
    json: async () => ({}),
  });

  const { apiFetch } = await import('../src/lib/api.js');
  const response = await apiFetch('/api/subscription');
  assert.equal(response.status, 401);
  assert.equal(assigned, '/');
  assert.equal(globalThis.localStorage.getItem('allmodelai_user'), null);
});
