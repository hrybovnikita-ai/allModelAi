import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  coerceProductionAuthDomain,
  FIREBASE_CUSTOM_AUTH_HOST,
  resolveAuthDomainForRuntime,
} from '../src/lib/firebaseAuthDomain.js';

const root = fileURLToPath(new URL('../', import.meta.url));

test('localhost keeps firebaseapp.com for Vite /__/auth proxy dev flow', async () => {
  const { resolveAuthDomainForRuntime } = await import('../src/lib/firebase.js');
  const previousWindow = global.window;
  global.window = {
    location: {
      hostname: 'localhost',
      origin: 'http://localhost:5173',
      protocol: 'http:',
      port: '5173',
    },
  };
  try {
    assert.equal(
      resolveAuthDomainForRuntime('allmodelai.firebaseapp.com'),
      'allmodelai.firebaseapp.com',
    );
  } finally {
    global.window = previousWindow;
  }
});

test('resolveAuthDomainForRuntime keeps firebaseapp.com when no override', () => {
  assert.equal(
    resolveAuthDomainForRuntime('allmodelai.firebaseapp.com'),
    'allmodelai.firebaseapp.com',
  );
});

test('resolveAuthDomainForRuntime uses env auth domain when set', () => {
  assert.equal(
    resolveAuthDomainForRuntime('allmodelai.firebaseapp.com', {
      envAuthDomain: 'allmodelai.firebaseapp.com',
    }),
    'allmodelai.firebaseapp.com',
  );
});

test('production app host uses Firebase custom auth domain for OAuth', () => {
  assert.equal(
    resolveAuthDomainForRuntime('allmodelai.firebaseapp.com', {
      envAuthDomain: 'allmodelai.firebaseapp.com',
      hostedHostname: 'all-model-ai.com',
    }),
    FIREBASE_CUSTOM_AUTH_HOST,
  );
  assert.equal(
    resolveAuthDomainForRuntime('allmodelai.firebaseapp.com', {
      hostedHostname: 'www.all-model-ai.com',
    }),
    FIREBASE_CUSTOM_AUTH_HOST,
  );
});

test('production site never keeps firebaseapp.com from env or configured merge', () => {
  assert.equal(
    resolveAuthDomainForRuntime('allmodelai.firebaseapp.com', {
      envAuthDomain: 'allmodelai.firebaseapp.com',
      hostedHostname: 'all-model-ai.com',
      customAuthDomainEnabled: false,
    }),
    FIREBASE_CUSTOM_AUTH_HOST,
  );
  assert.equal(
    resolveAuthDomainForRuntime('allmodelai.firebaseapp.com', {
      envAuthDomain: 'allmodelai.firebaseapp.com',
      hostedHostname: 'www.all-model-ai.com',
    }),
    FIREBASE_CUSTOM_AUTH_HOST,
  );
});

test('coerceProductionAuthDomain maps apex and firebaseapp hosts on live site', () => {
  assert.equal(
    coerceProductionAuthDomain('allmodelai.firebaseapp.com', 'all-model-ai.com'),
    FIREBASE_CUSTOM_AUTH_HOST,
  );
  assert.equal(
    coerceProductionAuthDomain('all-model-ai.com', 'www.all-model-ai.com'),
    FIREBASE_CUSTOM_AUTH_HOST,
  );
  assert.equal(
    coerceProductionAuthDomain('allmodelai.firebaseapp.com', 'localhost'),
    'allmodelai.firebaseapp.com',
  );
});

test('explicit env custom auth domain wins over hosted hostname', () => {
  assert.equal(
    resolveAuthDomainForRuntime('allmodelai.firebaseapp.com', {
      envAuthDomain: 'auth.all-model-ai.com',
      hostedHostname: 'all-model-ai.com',
    }),
    'auth.all-model-ai.com',
  );
});

test('unknown production host keeps firebaseapp.com unless custom auth flag', () => {
  assert.equal(
    resolveAuthDomainForRuntime('allmodelai.firebaseapp.com', {
      preferHostedAuthDomainWhenProxied: true,
      hostedHostname: 'allmodelai.com',
    }),
    'allmodelai.com',
  );
  assert.equal(
    resolveAuthDomainForRuntime('allmodelai.firebaseapp.com', {
      hostedHostname: 'allmodelai.com',
    }),
    'allmodelai.firebaseapp.com',
  );
});

test('custom auth domain flag uses hosted site hostname', () => {
  assert.equal(
    resolveAuthDomainForRuntime('allmodelai.firebaseapp.com', {
      customAuthDomainEnabled: true,
      hostedHostname: 'allmodelai.com',
    }),
    'allmodelai.com',
  );
});

test('empty configured domain falls back to default firebaseapp.com', () => {
  assert.equal(resolveAuthDomainForRuntime(''), 'allmodelai.firebaseapp.com');
});

test('iOS Safari uses custom auth host on production site (not firebaseapp.com)', async () => {
  const { shouldPreferHostedFirebaseAuthDomain, resolveAuthDomainForRuntime } = await import('../src/lib/firebase.js');
  const previousWindow = global.window;
  const previousNavigator = global.navigator;

  global.window = {
    location: {
      hostname: 'all-model-ai.com',
      origin: 'https://all-model-ai.com',
      protocol: 'https:',
    },
  };
  Object.defineProperty(global, 'navigator', {
    configurable: true,
    value: {
      userAgent:
        'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      maxTouchPoints: 5,
      platform: 'iPad',
    },
  });

  try {
    assert.equal(shouldPreferHostedFirebaseAuthDomain(), true);
    assert.equal(resolveAuthDomainForRuntime('allmodelai.firebaseapp.com'), FIREBASE_CUSTOM_AUTH_HOST);
  } finally {
    global.window = previousWindow;
    Object.defineProperty(global, 'navigator', { configurable: true, value: previousNavigator });
  }
});

test('vercel.json proxies Firebase auth handler under /__/auth', () => {
  const vercel = readFileSync(`${root}vercel.json`, 'utf8');
  assert.match(vercel, /\/__\/auth/);
  assert.match(vercel, /allmodelai\.firebaseapp\.com\/__\/auth\/:path\*/);
  assert.match(vercel, /"source": "\/__\/auth\/:path\*"/);
});
