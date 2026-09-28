import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_ANDROID_EMULATOR_API_ORIGIN,
  DEFAULT_PRODUCTION_API_ORIGIN,
  isCapacitorWebViewHost,
  resolveApiUrl,
} from '../src/lib/apiBase.js';

test('isCapacitorWebViewHost detects Capacitor https://localhost shell', () => {
  assert.equal(
    isCapacitorWebViewHost({ protocol: 'https:', hostname: 'localhost', port: '' }),
    true,
  );
  assert.equal(
    isCapacitorWebViewHost({ protocol: 'http:', hostname: 'localhost', port: '5173' }),
    false,
  );
});

test('resolveApiUrl uses production origin when forced native webview host', () => {
  const originalWindow = globalThis.window;
  globalThis.window = {
    location: { protocol: 'https:', hostname: 'localhost', port: '' },
    Capacitor: undefined,
  };
  try {
    const url = resolveApiUrl('/api/auth/login');
    assert.equal(url, `${DEFAULT_PRODUCTION_API_ORIGIN}/api/auth/login`);
  } finally {
    globalThis.window = originalWindow;
  }
});

test('android emulator API origin default uses 10.0.2.2', () => {
  assert.match(DEFAULT_ANDROID_EMULATOR_API_ORIGIN, /^http:\/\/10\.0\.2\.2:\d+$/);
});
