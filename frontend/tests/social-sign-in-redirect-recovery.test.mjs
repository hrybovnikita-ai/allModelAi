import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, test } from 'node:test';
import { resetGoogleRedirectBootstrapForTests } from '../src/lib/googleRedirectRecovery.js';
import {
  clearSocialRedirectIntent,
  markRedirectFlowCommitted,
  persistRedirectIntent,
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
  globalThis.window = { location: { pathname: '/', search: '', hash: '' } };
  resetGoogleRedirectBootstrapForTests();
});

afterEach(() => {
  clearSocialRedirectIntent();
  delete globalThis.sessionStorage;
  delete globalThis.localStorage;
  delete globalThis.window;
});

test('socialSignIn imports shouldAttemptGoogleRedirectRecovery for local use (not re-export only)', async () => {
  const source = await readFile(new URL('../src/lib/socialSignIn.js', import.meta.url), 'utf8');
  assert.match(
    source,
    /import \{[\s\S]*shouldAttemptGoogleRedirectRecovery[\s\S]*\} from '\.\/socialRedirectState\.js'/,
    'awaitGoogleRedirectRecovery must bind shouldAttemptGoogleRedirectRecovery locally',
  );
});

test('awaitGoogleRedirectRecovery resolves null without ReferenceError when not pending', async () => {
  const { awaitGoogleRedirectRecovery } = await import('../src/lib/socialSignIn.js');
  const result = await awaitGoogleRedirectRecovery('RegressionTest');
  assert.equal(result, null);
});

test('navigateAfterSocialLogin does not use delay retry loops', async () => {
  const signIn = await readFile(new URL('../src/lib/socialSignIn.js', import.meta.url), 'utf8');
  const navStart = signIn.indexOf('export async function navigateAfterSocialLogin');
  const navBlock = signIn.slice(navStart, navStart + 1200);
  assert.doesNotMatch(navBlock, /retryDelays/);
  assert.doesNotMatch(navBlock, /setTimeout/);
});

test('awaitGoogleRedirectRecovery skips while popup sign-in is active', async () => {
  persistRedirectIntent('Google', {}, 'awaiting-google-return');
  markRedirectFlowCommitted();
  const { markGooglePopupSignInStarted } = await import('../src/lib/socialRedirectState.js');
  markGooglePopupSignInStarted();
  const { awaitGoogleRedirectRecovery } = await import('../src/lib/socialSignIn.js');
  const result = await awaitGoogleRedirectRecovery('PopupActiveTest');
  assert.equal(result, null);
});

test('awaitGoogleRedirectRecovery does not throw when redirect is pending', async () => {
  persistRedirectIntent('Google', {}, 'awaiting-google-return');
  markRedirectFlowCommitted();
  globalThis.window.location.hash = '#apiKey=test';

  const { awaitGoogleRedirectRecovery } = await import('../src/lib/socialSignIn.js');
  let thrown;
  try {
    await awaitGoogleRedirectRecovery('RegressionTestPending');
  } catch (error) {
    thrown = error;
  }
  assert.ok(!thrown || thrown.name !== 'ReferenceError', 'must not reference undefined recovery helper');
});
