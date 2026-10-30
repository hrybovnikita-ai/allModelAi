import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { afterEach, test } from 'node:test';
import {
  beginGoogleSignInFlow,
  endGoogleSignInFlow,
  forceReleaseGoogleSignInFlow,
  GOOGLE_SIGNIN_FLOW_MAX_MS,
  isGoogleSignInFlowActive,
  markGooglePopupSignInEnded,
  markGooglePopupSignInStarted,
  resetGoogleSignInFlowForTests,
} from '../src/lib/socialRedirectState.js';

afterEach(() => {
  resetGoogleSignInFlowForTests();
});

test('beginGoogleSignInFlow allows only one concurrent OAuth flow', () => {
  assert.equal(beginGoogleSignInFlow(), true);
  assert.equal(isGoogleSignInFlowActive(), true);
  assert.equal(beginGoogleSignInFlow(), false);
  endGoogleSignInFlow();
  assert.equal(isGoogleSignInFlowActive(), false);
  assert.equal(beginGoogleSignInFlow(), true);
  endGoogleSignInFlow();
});

test('popup active flag blocks a second sign-in flow', () => {
  markGooglePopupSignInStarted();
  assert.equal(beginGoogleSignInFlow(), false);
  markGooglePopupSignInEnded();
  assert.equal(beginGoogleSignInFlow(), true);
  endGoogleSignInFlow();
});

test('forceReleaseGoogleSignInFlow clears stale popup and flow locks', () => {
  assert.equal(beginGoogleSignInFlow(), true);
  markGooglePopupSignInStarted();
  assert.equal(isGoogleSignInFlowActive(), true);
  forceReleaseGoogleSignInFlow('test');
  assert.equal(isGoogleSignInFlowActive(), false);
  assert.equal(beginGoogleSignInFlow(), true);
  endGoogleSignInFlow();
});

test('stale OAuth lock auto-releases after GOOGLE_SIGNIN_FLOW_MAX_MS', () => {
  assert.ok(GOOGLE_SIGNIN_FLOW_MAX_MS >= 120_000);
  assert.equal(beginGoogleSignInFlow(), true);
  const originalNow = Date.now;
  Date.now = () => originalNow() + GOOGLE_SIGNIN_FLOW_MAX_MS + 1;
  try {
    assert.equal(beginGoogleSignInFlow(), true);
  } finally {
    Date.now = originalNow;
  }
  endGoogleSignInFlow();
});

test('desktop popup-blocked does not auto-start redirect', async () => {
  const signIn = await readFile(new URL('../src/lib/socialSignIn.js', import.meta.url), 'utf8');
  const blockStart = signIn.indexOf("error.code === 'auth/popup-blocked'");
  assert.ok(blockStart > 0);
  const block = signIn.slice(blockStart, blockStart + 900);
  // Redirect fallback is gated; desktop popup-first still throws when redirect is not allowed.
  assert.match(block, /shouldPreferGoogleRedirectSignIn|shouldTryGooglePopupFirst|canUseGoogleRedirectSignIn/);
  assert.match(block, /throw error/);
});
