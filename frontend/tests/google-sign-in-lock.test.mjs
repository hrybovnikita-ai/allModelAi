import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { afterEach, test } from 'node:test';
import {
  beginGoogleSignInFlow,
  endGoogleSignInFlow,
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

test('desktop popup-blocked does not auto-start redirect', async () => {
  const signIn = await readFile(new URL('../src/lib/socialSignIn.js', import.meta.url), 'utf8');
  const blockStart = signIn.indexOf('auth/popup-blocked');
  assert.ok(blockStart > 0);
  const block = signIn.slice(blockStart, blockStart + 420);
  assert.match(block, /shouldPreferGoogleRedirectSignIn/);
  assert.match(block, /throw error/);
});
