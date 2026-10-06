import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  DEFAULT_CAPACITOR_NATIVE_API_ORIGIN,
  isBrowserLocalhostDev,
  resolveApiUrl,
} from '../src/lib/apiBase.js';

afterEach(() => {
  delete globalThis.window;
});

test('desktop localhost:5174 never uses 10.0.2.2 for /api', () => {
  globalThis.window = {
    location: {
      protocol: 'http:',
      hostname: 'localhost',
      port: '5174',
      origin: 'http://localhost:5174',
    },
    Capacitor: undefined,
  };
  assert.equal(isBrowserLocalhostDev(), true);
  assert.equal(resolveApiUrl('/api/auth/session'), '/api/auth/session');
  assert.equal(resolveApiUrl('/api/plans/checkout-info'), '/api/plans/checkout-info');
});

test('desktop localhost:5173 uses relative /api (Vite proxy)', () => {
  globalThis.window = {
    location: { protocol: 'http:', hostname: 'localhost', port: '5173', origin: 'http://localhost:5173' },
    Capacitor: undefined,
  };
  assert.equal(resolveApiUrl('/api/health'), '/api/health');
});

test('Capacitor https://localhost (no port) still uses emulator API base', () => {
  globalThis.window = {
    location: { protocol: 'https:', hostname: 'localhost', port: '', origin: 'https://localhost' },
    Capacitor: undefined,
  };
  assert.equal(isBrowserLocalhostDev(), false);
  assert.equal(
    resolveApiUrl('/api/auth/session'),
    `${DEFAULT_CAPACITOR_NATIVE_API_ORIGIN}/api/auth/session`,
  );
});
