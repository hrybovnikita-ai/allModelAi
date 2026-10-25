import assert from 'node:assert/strict';
import test from 'node:test';
import { authGet, resolveAuthApiUrl } from '../src/lib/authApi.js';
import { applyAuthResponsePayload, getNativeSessionToken, storeNativeSessionToken } from '../src/lib/nativeSession.js';

test('cookie-only login replaces an old header session; custom headers preserve authentication', async () => {
  const oldStorage = globalThis.localStorage;
  const oldFetch = globalThis.fetch;
  const values = new Map();
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  try {
    storeNativeSessionToken('old-session');
    globalThis.fetch = async (_url, options) => {
      assert.equal(options.headers['X-AllModelAI-Session'], 'old-session');
      assert.equal(options.headers['X-Test'], 'custom');
      assert.equal(options.credentials, 'include');
      return Response.json({});
    };
    await authGet('session', { headers: { 'X-Test': 'custom' } });
    applyAuthResponsePayload({ message: 'failed' });
    assert.equal(getNativeSessionToken(), 'old-session');
    applyAuthResponsePayload({ user: { email: 'new@example.com' } });
    assert.equal(getNativeSessionToken(), null);
    applyAuthResponsePayload({ user: { email: 'new@example.com' }, nativeSessionToken: 'new-session' });
    assert.equal(getNativeSessionToken(), 'new-session');
  } finally {
    globalThis.localStorage = oldStorage;
    globalThis.fetch = oldFetch;
  }
});

test('resolveAuthApiUrl maps signin to login on Capacitor localhost', () => {
  const originalWindow = globalThis.window;
  globalThis.window = {
    location: { protocol: 'https:', hostname: 'localhost', port: '' },
    Capacitor: undefined,
  };
  try {
    assert.equal(
      resolveAuthApiUrl('login'),
      'http://10.0.2.2:5050/api/auth/login',
    );
    assert.equal(
      resolveAuthApiUrl('signin'),
      'http://10.0.2.2:5050/api/auth/login',
    );
    assert.equal(
      resolveAuthApiUrl('session'),
      'http://10.0.2.2:5050/api/auth/session',
    );
  } finally {
    globalThis.window = originalWindow;
  }
});
