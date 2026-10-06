import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  coerceApiUrlToSameOrigin,
  isAllModelAiBackendRequestUrl,
  isExternalAuthProviderUrl,
} from '../src/lib/apiBase.js';

function mockHostedWeb() {
  globalThis.window = {
    location: {
      protocol: 'https:',
      hostname: 'all-model-ai.com',
      origin: 'https://all-model-ai.com',
      port: '',
    },
  };
}

afterEach(() => {
  delete globalThis.window;
});

test('Google and Firebase provider URLs are never treated as AllModelAI backend URLs', () => {
  mockHostedWeb();
  const external = [
    'https://accounts.google.com/o/oauth2/auth?client_id=x',
    'https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp',
    'https://securetoken.googleapis.com/v1/token',
    'https://allmodelai.firebaseapp.com/__/auth/handler',
    'https://www.googleapis.com/identitytoolkit/v3/relyingparty/getProjectConfig',
  ];
  for (const url of external) {
    assert.equal(isExternalAuthProviderUrl(url), true, url);
    assert.equal(isAllModelAiBackendRequestUrl(url), false, url);
    assert.equal(coerceApiUrlToSameOrigin(url), url, url);
  }
});

test('Render and same-origin /api URLs are backend requests on hosted web', () => {
  mockHostedWeb();
  assert.equal(isAllModelAiBackendRequestUrl('/api/auth/firebase/challenge'), true);
  assert.equal(
    isAllModelAiBackendRequestUrl('https://allmodelai-backend.onrender.com/api/auth/firebase/challenge'),
    true,
  );
  assert.equal(
    coerceApiUrlToSameOrigin('https://allmodelai-backend.onrender.com/api/auth/firebase/challenge'),
    '/api/auth/firebase/challenge',
  );
});
