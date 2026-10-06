import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { resolveAuthApiUrl } from '../src/lib/authApi.js';
import {
  coerceApiUrlToSameOrigin,
  prefersSameOriginApi,
  resolveApiUrl,
} from '../src/lib/apiBase.js';

function mockHostedSafari() {
  globalThis.window = {
    location: {
      protocol: 'https:',
      hostname: 'all-model-ai.com',
      origin: 'https://all-model-ai.com',
      port: '',
    },
    Capacitor: undefined,
  };
}

afterEach(() => {
  delete globalThis.window;
});

test('hosted production web prefers same-origin /api paths even when VITE_API_BASE_URL is baked in', () => {
  mockHostedSafari();
  assert.equal(prefersSameOriginApi(), true);
  assert.equal(resolveApiUrl('/api/auth/session'), '/api/auth/session');
  assert.equal(
    resolveAuthApiUrl('session'),
    '/api/auth/session',
  );
  assert.equal(
    coerceApiUrlToSameOrigin('https://allmodelai-backend.onrender.com/api/auth/session'),
    '/api/auth/session',
  );
});

test('capacitor localhost still uses absolute native API base', () => {
  globalThis.window = {
    location: { protocol: 'https:', hostname: 'localhost', origin: 'https://localhost', port: '' },
    Capacitor: undefined,
  };
  assert.equal(prefersSameOriginApi(), false);
  assert.equal(resolveAuthApiUrl('session'), 'http://10.0.2.2:5050/api/auth/session');
});
