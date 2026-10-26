import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, test } from 'node:test';
import { resetFirebaseRedirectCoordinatorForTests } from '../src/lib/firebaseRedirectCoordinator.js';
import { resetGoogleRedirectBootstrapForTests } from '../src/lib/googleRedirectRecovery.js';
import { resetSocialAuthReadyForTests } from '../src/lib/firebase.js';
import {
  clearSocialRedirectIntent,
  markRedirectFlowCommitted,
  persistRedirectIntent,
  shouldAttemptGoogleRedirectRecovery,
} from '../src/lib/socialRedirectState.js';

class MemoryStorage {
  constructor() {
    this.store = new Map();
  }

  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }

  setItem(key, value) {
    this.store.set(key, String(value));
  }

  removeItem(key) {
    this.store.delete(key);
  }
}

beforeEach(() => {
  globalThis.sessionStorage = new MemoryStorage();
  globalThis.localStorage = new MemoryStorage();
  globalThis.window = {
    location: {
      hostname: 'all-model-ai.com',
      origin: 'https://all-model-ai.com',
      pathname: '/',
      search: '',
      hash: '',
      protocol: 'https:',
    },
  };
  resetGoogleRedirectBootstrapForTests();
  resetFirebaseRedirectCoordinatorForTests();
  resetSocialAuthReadyForTests();
});

afterEach(() => {
  clearSocialRedirectIntent();
  delete globalThis.sessionStorage;
  delete globalThis.localStorage;
  delete globalThis.window;
  resetGoogleRedirectBootstrapForTests();
  resetFirebaseRedirectCoordinatorForTests();
  resetSocialAuthReadyForTests();
});

const IPAD_SAFARI_UA = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const CHROME_WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

test('iPad Safari prefers redirect sign-in over popup', async () => {
  const { shouldPreferGoogleRedirectSignIn, shouldTryGooglePopupFirst } = await import('../src/lib/socialSignInEnv.js');
  assert.equal(shouldPreferGoogleRedirectSignIn(IPAD_SAFARI_UA), true);
  assert.equal(shouldTryGooglePopupFirst(IPAD_SAFARI_UA), false);
});

test('Chrome desktop prefers popup and does not require redirect recovery', async () => {
  const { shouldPreferGoogleRedirectSignIn, shouldTryGooglePopupFirst } = await import('../src/lib/socialSignInEnv.js');
  assert.equal(shouldPreferGoogleRedirectSignIn(CHROME_WINDOWS_UA), false);
  assert.equal(shouldTryGooglePopupFirst(CHROME_WINDOWS_UA), true);
});

test('production authDomain resolves to all-model-ai.com', async () => {
  const {
    resolveAuthDomainForRuntime,
    applyRuntimeFirebaseConfig,
    getEffectiveFirebaseConfig,
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
  applyRuntimeFirebaseConfig({
    apiKey: 'AIzaSyRuntimeKey123456789012345',
    authDomain: 'allmodelai.firebaseapp.com',
    projectId: 'allmodelai',
    appId: '1:123456789:web:abcdef123456',
  });
  try {
    assert.equal(resolveAuthDomainForRuntime('allmodelai.firebaseapp.com'), 'all-model-ai.com');
    assert.equal(getEffectiveFirebaseConfig().authDomain, 'all-model-ai.com');
  } finally {
    global.window = previousWindow;
  }
});

test('pending redirect recovery defers setPersistence until after getRedirectResult', async () => {
  const source = await readFile(new URL('../src/lib/firebase.js', import.meta.url), 'utf8');
  assert.match(source, /AUTH_PERSISTENCE_DEFERRED/);
  assert.match(source, /shouldAttemptGoogleRedirectRecovery/);
  assert.match(source, /applyAuthPersistenceAfterRedirectRecovery/);
  assert.match(source, /Deferring setPersistence until after getRedirectResult/);

  persistRedirectIntent('Google', {}, 'awaiting-google-return');
  markRedirectFlowCommitted();
  assert.equal(shouldAttemptGoogleRedirectRecovery(), true);
});

test('redirect recovery bootstrap caches settled result for StrictMode remounts', async () => {
  const {
    bootstrapGoogleRedirectRecovery,
    getRedirectRecoveryPromise,
    resetGoogleRedirectBootstrapForTests: reset,
  } = await import('../src/lib/googleRedirectRecovery.js');
  reset();
  persistRedirectIntent('Google', {}, 'awaiting-google-return');
  markRedirectFlowCommitted();

  let runs = 0;
  const first = bootstrapGoogleRedirectRecovery(async () => {
    runs += 1;
    return { email: 'user@example.com', name: 'User' };
  });
  const second = bootstrapGoogleRedirectRecovery(async () => {
    runs += 1;
    return { email: 'other@example.com' };
  });
  const [a, b] = await Promise.all([first, second]);
  assert.equal(runs, 1);
  assert.equal(a.email, 'user@example.com');
  assert.equal(b.email, 'user@example.com');
  const cached = await getRedirectRecoveryPromise();
  assert.equal(cached.email, 'user@example.com');
});

test('interrupted redirect with expired intent is not attempted', async () => {
  persistRedirectIntent('Google', {}, 'awaiting-google-return');
  markRedirectFlowCommitted();
  const raw = sessionStorage.getItem('allmodelai_social_redirect');
  const parsed = JSON.parse(raw);
  parsed.expires = Date.now() - 1000;
  parsed.redirectStartedAt = Date.now() - 200000;
  sessionStorage.setItem('allmodelai_social_redirect', JSON.stringify(parsed));
  localStorage.setItem('allmodelai_social_redirect_backup', JSON.stringify(parsed));
  assert.equal(shouldAttemptGoogleRedirectRecovery(), false);
});

test('navigateAfterSocialLogin requires confirmed backend session before dashboard', async () => {
  const signIn = await readFile(new URL('../src/lib/socialSignIn.js', import.meta.url), 'utf8');
  const navStart = signIn.indexOf('export async function navigateAfterSocialLogin');
  const navBlock = signIn.slice(navStart, navStart + 1600);
  assert.match(navBlock, /confirmSession/);
  assert.match(navBlock, /SESSION_COOKIE_MISSING/);
  assert.doesNotMatch(navBlock, /serverVerified:\s*false/);
});

test('GoogleRedirectRecoveryGate only shows incomplete after recovery settles', async () => {
  const gate = await readFile(
    new URL('../src/components/SocialAuth/GoogleRedirectRecoveryGate.jsx', import.meta.url),
    'utf8',
  );
  assert.match(gate, /awaitGoogleRedirectRecovery/);
  assert.match(gate, /clearSocialRedirectIntent/);
  assert.match(gate, /Sign-in incomplete/);
  assert.match(gate, /Finishing sign-in/);
  assert.match(gate, /navigateAfterSocialLogin/);
});
