import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_CAPACITOR_NATIVE_API_ORIGIN,
  getBrowserApiOrigin,
  isCapacitorWebViewHost,
  isViteDevServerHost,
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

test('resolveApiUrl uses native loopback when WebView host is Capacitor localhost', () => {
  const originalWindow = globalThis.window;
  globalThis.window = {
    location: { protocol: 'https:', hostname: 'localhost', port: '' },
    Capacitor: undefined,
  };
  try {
    const url = resolveApiUrl('/api/auth/login');
    assert.equal(url, `${DEFAULT_CAPACITOR_NATIVE_API_ORIGIN}/api/auth/login`);
  } finally {
    globalThis.window = originalWindow;
  }
});

test('default Capacitor native API uses 10.0.2.2', () => {
  assert.match(DEFAULT_CAPACITOR_NATIVE_API_ORIGIN, /^http:\/\/10\.0\.2\.2:\d+$/);
});

test('isViteDevServerHost detects local Vite ports', () => {
  assert.equal(isViteDevServerHost({ hostname: 'localhost', port: '5173' }), true);
  assert.equal(isViteDevServerHost({ hostname: 'localhost', port: '' }), false);
});

test('resolveApiUrl keeps first-party relative /api paths on production web hosts', () => {
  const originalWindow = globalThis.window;
  globalThis.window = {
    location: { protocol: 'https:', hostname: 'all-model-ai.vercel.app', port: '', origin: 'https://all-model-ai.vercel.app' },
    Capacitor: undefined,
  };
  try {
    assert.equal(
      resolveApiUrl('/api/status/models'),
      '/api/status/models',
    );
    assert.equal(getBrowserApiOrigin(), 'https://all-model-ai.vercel.app');
  } finally {
    globalThis.window = originalWindow;
  }
});
