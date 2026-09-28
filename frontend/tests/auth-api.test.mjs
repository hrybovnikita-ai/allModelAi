import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAuthApiUrl } from '../src/lib/authApi.js';

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
