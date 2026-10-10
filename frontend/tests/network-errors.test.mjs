import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyNetworkError } from '../src/lib/networkErrors.js';

test('classifyNetworkError maps Failed to fetch on localhost dev to BACKEND_UNREACHABLE', () => {
  globalThis.window = {
    location: { protocol: 'http:', hostname: 'localhost', port: '5174', origin: 'http://localhost:5174' },
    Capacitor: undefined,
  };
  const { code, message } = classifyNetworkError(new TypeError('Failed to fetch'));
  assert.equal(code, 'BACKEND_UNREACHABLE');
  assert.match(message, /5050|local/i);
  delete globalThis.window;
});

test('classifyNetworkError maps Firebase unauthorized domain', () => {
  const { code } = classifyNetworkError({ code: 'auth/unauthorized-domain', message: 'x' });
  assert.equal(code, 'FIREBASE_UNAUTHORIZED_DOMAIN');
});

test('classifyNetworkError maps identitytoolkit connection failures to Firebase network', () => {
  const { code, message } = classifyNetworkError(
    new TypeError('Failed to fetch https://identitytoolkit.googleapis.com/v1/projects'),
  );
  assert.equal(code, 'FIREBASE_NETWORK_ERROR');
  assert.match(message, /Firebase|Google/i);
});
