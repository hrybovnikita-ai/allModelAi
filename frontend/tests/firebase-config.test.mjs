import { test } from 'node:test';
import assert from 'node:assert/strict';

test('firebase config documents VITE_ environment variable names', async () => {
  const { getFirebaseConfigEnvKeys } = await import('../src/lib/firebase.js');
  assert.deepEqual(getFirebaseConfigEnvKeys(), {
    apiKey: 'VITE_FIREBASE_API_KEY',
    authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
    projectId: 'VITE_FIREBASE_PROJECT_ID',
    appId: 'VITE_FIREBASE_APP_ID',
  });
});

test('firebase auth persistence falls back for Safari Private Browsing', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/lib/firebase.js', import.meta.url), 'utf8');
  assert.match(source, /browserLocalPersistence/);
  assert.match(source, /browserSessionPersistence/);
  assert.match(source, /inMemoryPersistence/);
  assert.match(source, /applyAuthPersistenceSafely/);
});

test('firebase.js does not map production hostname onto authDomain', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/lib/firebase.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /return 'all-model-ai\.com'/);
  assert.doesNotMatch(source, /hostnameFromPublicUrl/);
  assert.match(source, /VITE_FIREBASE_AUTH_DOMAIN/);
});

test('runtime firebase config from API merges when Vite env is empty', async () => {
  const {
    applyRuntimeFirebaseConfig,
    getEffectiveFirebaseConfig,
    isFirebaseSocialConfigured,
    isUsableFirebaseConfigValue,
  } = await import('../src/lib/firebase.js');

  assert.equal(isUsableFirebaseConfigValue(''), false);
  assert.equal(isUsableFirebaseConfigValue('your-project.firebaseapp.com'), false);

  applyRuntimeFirebaseConfig({
    apiKey: 'AIzaSyRuntimeKey123456789012345',
    authDomain: 'demo-allmodelai.firebaseapp.com',
    projectId: 'demo-allmodelai',
    appId: '1:123456789:web:abcdef123456',
  });

  assert.equal(isFirebaseSocialConfigured(), true);
  assert.deepEqual(getEffectiveFirebaseConfig(), {
    apiKey: 'AIzaSyRuntimeKey123456789012345',
    authDomain: 'demo-allmodelai.firebaseapp.com',
    projectId: 'demo-allmodelai',
    appId: '1:123456789:web:abcdef123456',
  });
});
