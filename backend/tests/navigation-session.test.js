const { test } = require('node:test');
const assert = require('node:assert/strict');

test('navigation reuses server-verified sessions and never trusts a stored profile alone', async () => {
  const oldFetch = global.fetch;
  const oldStorage = Object.getOwnPropertyDescriptor(global, 'sessionStorage');
  const values = new Map();
  Object.defineProperty(global, 'sessionStorage', { configurable: true, value: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  } });
  let calls = 0;
  let status = 200;
  const user = { id: 1, name: 'Navigation User', email: 'navigation@example.com' };
  global.fetch = async (url, options) => {
    calls++;
    assert.equal(url, '/api/auth/session');
    assert.equal(options.credentials, 'include');
    assert.equal(options.cache, 'no-store');
    return new Response(JSON.stringify({ user }), { status });
  };
  try {
    const { restoreSession, rememberSession } = await import('../../frontend/src/lib/session.js');
    const restored = await Promise.all([restoreSession(), restoreSession()]);
    assert.deepEqual(restored, [user, user]);
    assert.equal(calls, 1);
    for (const route of ['/chat', '/settings', '/dashboard', '/arena']) {
      assert.deepEqual(await restoreSession(), user, route);
    }
    assert.equal(calls, 1);
    sessionStorage.removeItem('allmodelai_user');
    status = 401;
    assert.equal(await restoreSession(), null);
    sessionStorage.setItem('allmodelai_user', JSON.stringify(user));
    assert.equal(await restoreSession(), null);
    assert.equal(sessionStorage.getItem('allmodelai_user'), null);
    rememberSession(user);
    const callsAfterLogin = calls;
    assert.deepEqual(await restoreSession(), user);
    assert.equal(calls, callsAfterLogin);
    sessionStorage.removeItem('allmodelai_user');
    status = 503;
    await assert.rejects(restoreSession(), /Could not verify/);
    status = 200;
    assert.deepEqual(await restoreSession(), user);
  } finally {
    global.fetch = oldFetch;
    if (oldStorage) Object.defineProperty(global, 'sessionStorage', oldStorage);
    else delete global.sessionStorage;
  }
});
