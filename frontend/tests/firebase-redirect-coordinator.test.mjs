import { test } from 'node:test';
import assert from 'node:assert/strict';

test('resolveAuthDomainForRuntime uses custom domain on production host', async () => {
  const { resolveAuthDomainForRuntime } = await import('../src/lib/firebase.js');
  const previous = global.window;
  global.window = { location: { hostname: 'all-model-ai.com' } };
  try {
    assert.equal(
      resolveAuthDomainForRuntime('all-model-ai.com'),
      'all-model-ai.com',
    );
    assert.equal(
      resolveAuthDomainForRuntime('allmodelai.firebaseapp.com'),
      'all-model-ai.com',
    );
  } finally {
    global.window = previous;
  }
});

test('redirect coordinator caches inflight and consumed redirect results', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/lib/firebaseRedirectCoordinator.js', import.meta.url), 'utf8');
  assert.match(source, /redirectResultInflight/);
  assert.match(source, /cachedRedirectResult/);
  assert.match(source, /redirectResultConsumed/);
  assert.match(source, /GET_REDIRECT_RESULT_BEGIN.*consumer/s);
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
  assert.match(signIn, /consumeFirebaseRedirectResult/);
  assert.match(signIn, /BACKEND_CHALLENGE_START/);
});
