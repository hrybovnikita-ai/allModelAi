import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FIREBASE_CUSTOM_AUTH_HOST } from '../src/lib/firebaseAuthDomain.js';

test('hosted production web never initializes Firebase with firebaseapp.com authDomain', async () => {
  const {
    applyRuntimeFirebaseConfig,
    getEffectiveFirebaseConfig,
    resetSocialAuthReadyForTests,
  } = await import('../src/lib/firebase.js');

  const previousWindow = global.window;
  global.window = {
    location: {
      hostname: 'all-model-ai.com',
      origin: 'https://all-model-ai.com',
      protocol: 'https:',
      port: '',
    },
  };

  try {
    resetSocialAuthReadyForTests();
    applyRuntimeFirebaseConfig({
      apiKey: 'AIzaSyRuntimeKey123456789012345',
      authDomain: 'allmodelai.firebaseapp.com',
      projectId: 'allmodelai',
      appId: '1:123456789:web:abcdef123456',
    });

    const config = getEffectiveFirebaseConfig();
    assert.equal(config.authDomain, FIREBASE_CUSTOM_AUTH_HOST);
    assert.notEqual(config.authDomain, 'allmodelai.firebaseapp.com');
  } finally {
    global.window = previousWindow;
    resetSocialAuthReadyForTests();
  }
});

test('initializeApp config uses same authDomain as getEffectiveFirebaseConfig on production', async () => {
  const {
    applyRuntimeFirebaseConfig,
    getEffectiveFirebaseConfig,
    resetSocialAuthReadyForTests,
  } = await import('../src/lib/firebase.js');

  const previousWindow = global.window;
  global.window = {
    location: {
      hostname: 'all-model-ai.com',
      origin: 'https://all-model-ai.com',
      protocol: 'https:',
      port: '',
    },
  };

  try {
    resetSocialAuthReadyForTests();
    applyRuntimeFirebaseConfig({
      apiKey: 'AIzaSyRuntimeKey123456789012345',
      authDomain: 'allmodelai.firebaseapp.com',
      projectId: 'allmodelai',
      appId: '1:123456789:web:abcdef123456',
    });

    const expected = getEffectiveFirebaseConfig().authDomain;
    assert.equal(expected, FIREBASE_CUSTOM_AUTH_HOST);
  } finally {
    global.window = previousWindow;
    resetSocialAuthReadyForTests();
  }
});
