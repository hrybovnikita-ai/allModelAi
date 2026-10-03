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
