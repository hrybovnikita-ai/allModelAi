import assert from 'node:assert/strict';
import { test } from 'node:test';
import { navigateAfterSocialLogin } from '../src/lib/socialSignIn.js';
import { clearAllSessionData } from '../src/lib/session.js';

test('hosted production web uses SPA navigation to dashboard after Google login', async (t) => {
  const oldFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = oldFetch;
    clearAllSessionData();
    delete globalThis.window;
    delete globalThis.localStorage;
    delete globalThis.sessionStorage;
  });

  globalThis.localStorage = {
    store: new Map(),
    getItem(key) { return this.store.get(key) ?? null; },
    setItem(key, value) { this.store.set(key, String(value)); },
    removeItem(key) { this.store.delete(key); },
  };
  globalThis.sessionStorage = globalThis.localStorage;

  globalThis.window = {
    location: {
      protocol: 'https:',
      hostname: 'all-model-ai.com',
      origin: 'https://all-model-ai.com',
      port: '',
      replace: () => {
        throw new Error('hard navigation should not run on hosted web');
      },
    },
    dispatchEvent: () => true,
  };

  globalThis.fetch = async (url) => {
    if (String(url).includes('/session')) {
      return Response.json({ user: { email: 'user@example.com', name: 'User' } });
    }
    return Response.json({});
  };

  let target = null;
  await navigateAfterSocialLogin(
    { email: 'user@example.com', name: 'User' },
    { navigate: (path) => { target = path; } },
  );
  assert.equal(target, '/dashboard');
});
