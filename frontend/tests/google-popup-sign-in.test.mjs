import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GOOGLE_POPUP_RECENT_SIGNIN_MS,
  isFreshGoogleSignInUser,
  resetGooglePopupSignInBaselineForTests,
  waitForFreshAuthUser,
  awaitGooglePopupSignInResult,
} from '../src/lib/googlePopupSignIn.js';

test('already available fresh Firebase user recovers without a TDZ error', async () => {
  const user = { uid: 'fresh', email: 'fresh@example.com', metadata: { lastSignInTime: new Date().toISOString() } };
  const result = await waitForFreshAuthUser({ currentUser: user }, null, Date.now(), 20);
  assert.equal(result.user, user);
  resetGooglePopupSignInBaselineForTests();
  const popup = await awaitGooglePopupSignInResult({ currentUser: user }, new Promise(() => {}), { timeoutMs: 20 });
  assert.equal(popup.user, user);
});

test('cancelled auth-state waits reject without subscribing to Firebase', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(waitForFreshAuthUser({ currentUser: null }, null, Date.now(), 20, controller.signal), { code: 'auth/cancelled-popup-request' });
});

test('isFreshGoogleSignInUser rejects stale baseline uid', () => {
  resetGooglePopupSignInBaselineForTests();
  const startedAt = Date.now();
  assert.equal(
    isFreshGoogleSignInUser(
      { uid: 'same', email: 'a@test.com', metadata: { lastSignInTime: new Date().toISOString() } },
      'same',
      startedAt,
    ),
    false,
  );
});

test('isFreshGoogleSignInUser accepts new uid with recent sign-in', () => {
  const startedAt = Date.now();
  assert.equal(
    isFreshGoogleSignInUser(
      {
        uid: 'new-user',
        email: 'a@test.com',
        metadata: { lastSignInTime: new Date().toISOString() },
      },
      'old-user',
      startedAt,
    ),
    true,
  );
});

test('isFreshGoogleSignInUser rejects sign-in older than recovery window', () => {
  const startedAt = Date.now() - GOOGLE_POPUP_RECENT_SIGNIN_MS - 1000;
  assert.equal(
    isFreshGoogleSignInUser(
      {
        uid: 'new-user',
        email: 'a@test.com',
        metadata: { lastSignInTime: new Date(startedAt).toISOString() },
      },
      null,
      startedAt,
    ),
    false,
  );
});

test('starting a popup does not make an old Firebase user fresh', () => {
  assert.equal(isFreshGoogleSignInUser({ uid: 'old', email: 'old@example.com', metadata: {
    lastSignInTime: new Date(Date.now() - 3600000).toISOString(),
  } }, null, Date.now()), false);
});

test('launchGooglePopupSignIn does not read auth before const auth (TDZ)', async () => {
  const source = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../src/lib/socialSignIn.js', import.meta.url), 'utf8'),
  );
  const fn = source.slice(source.indexOf('export function launchGooglePopupSignIn'));
  const body = fn.slice(0, fn.indexOf('export async function completeGooglePopupSignIn'));
  const declare = body.indexOf('const auth = getSocialAuth()');
  const use = body.indexOf('markGooglePopupSignInBaseline(auth)');
  assert.ok(declare > 0 && use > declare, 'baseline must run after auth is initialized');
});

test('completeGooglePopupSignIn prefetches backend challenge in parallel', async () => {
  const source = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../src/lib/socialSignIn.js', import.meta.url), 'utf8'),
  );
  assert.match(source, /const challengePromise = prepareBackendChallenge\(options\)/);
  assert.match(source, /await awaitGooglePopupSignInResult\(auth, popupPromise\)/);
});
