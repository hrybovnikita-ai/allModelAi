import { test } from 'node:test';
import assert from 'node:assert/strict';

test('resolveAuthDomainForRuntime keeps firebaseapp.com on production website host', async () => {
  const {
    resolveAuthDomainForRuntime,
    applyRuntimeFirebaseConfig,
    getEffectiveFirebaseConfig,
  } = await import('../src/lib/firebase.js');
  const previousWindow = global.window;

  global.window = { location: { hostname: 'all-model-ai.com', origin: 'https://all-model-ai.com' } };
  applyRuntimeFirebaseConfig({
    apiKey: 'AIzaSyRuntimeKey123456789012345',
    authDomain: 'allmodelai.firebaseapp.com',
    projectId: 'allmodelai',
    appId: '1:123456789:web:abcdef123456',
  });

  try {
    assert.equal(
      resolveAuthDomainForRuntime('allmodelai.firebaseapp.com'),
      'allmodelai.firebaseapp.com',
    );
    assert.equal(getEffectiveFirebaseConfig().authDomain, 'allmodelai.firebaseapp.com');
  } finally {
    global.window = previousWindow;
  }
});

test('resolveAuthDomainForRuntime does not map website hostname to authDomain', async () => {
  const { resolveAuthDomainForRuntime } = await import('../src/lib/firebase.js');
  const previousWindow = global.window;
  global.window = { location: { hostname: 'www.all-model-ai.com' } };
  try {
    assert.equal(
      resolveAuthDomainForRuntime('allmodelai.firebaseapp.com'),
      'allmodelai.firebaseapp.com',
    );
  } finally {
    global.window = previousWindow;
  }
});

test('redirect coordinator caches inflight and consumed redirect results', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/lib/firebaseRedirectCoordinator.js', import.meta.url), 'utf8');
  assert.match(source, /redirectResultInflight/);
  assert.match(source, /cachedRedirectResult/);
  assert.match(source, /redirectResultConsumed/);
  assert.match(source, /GET_REDIRECT_RESULT_BEGIN.*consumer/s);
  assert.match(source, /settleGetRedirectResult/);
  assert.match(source, /GET_REDIRECT_RESULT_TIMEOUT/);
  assert.match(source, /Promise\.race/);
});

test('SocialAuthCallback does not start redirect; gate and bootstrap own recovery', async () => {
  const { readFile } = await import('node:fs/promises');
  const callback = await readFile(new URL('../src/components/SocialAuth/SocialAuthCallback.jsx', import.meta.url), 'utf8');
  const gate = await readFile(new URL('../src/components/SocialAuth/GoogleRedirectRecoveryGate.jsx', import.meta.url), 'utf8');
  const signIn = await readFile(new URL('../src/lib/socialSignIn.js', import.meta.url), 'utf8');

  assert.doesNotMatch(callback, /signInWithRedirect/);
  assert.doesNotMatch(callback, /getRedirectResult/);
  assert.match(callback, /awaitGoogleRedirectRecovery/);
  assert.match(gate, /awaitGoogleRedirectRecovery/);
  assert.match(gate, /RECOVERY_OVERLAY_SAFETY_MS/);
  assert.match(signIn, /consumeFirebaseRedirectResult/);
  assert.match(signIn, /BACKEND_CHALLENGE_START/);
  assert.match(signIn, /clearSocialRedirectIntent/);
});
