const { test } = require('node:test');
const assert = require('node:assert/strict');

for (const failure of ['property', 'operations']) {
  test(`mobile login works when browser storage rejects ${failure}`, async () => {
    const originals = Object.fromEntries(['localStorage', 'sessionStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    const oldFetch = globalThis.fetch;
    const denied = () => { throw new Error('Storage access denied'); };
    for (const key of Object.keys(originals)) {
      Object.defineProperty(globalThis, key, failure === 'property'
        ? { configurable: true, get: denied }
        : { configurable: true, value: { getItem: denied, setItem: denied, removeItem: denied } });
    }
    let calls = 0;
    const user = { id: 1, name: 'Mobile User', email: 'mobile@example.com' };
    globalThis.fetch = async () => { calls++; return new Response('{}', { status: 401 }); };
    try {
      const { rememberSession, restoreSession, clearAllSessionData } = await import(`../../frontend/src/lib/session.js?mobile=${failure}`);
      assert.deepEqual(rememberSession(user), user);
      assert.deepEqual(await restoreSession(), user);
      assert.deepEqual(await restoreSession(), user);
      assert.equal(calls, 0, 'login remains available without persistent storage');
      clearAllSessionData();
      assert.equal(await restoreSession(), null);
      assert.equal(calls, 1, 'sign-out clears the verified in-memory session');
    } finally {
      globalThis.fetch = oldFetch;
      for (const [key, descriptor] of Object.entries(originals)) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    }
  });
}
