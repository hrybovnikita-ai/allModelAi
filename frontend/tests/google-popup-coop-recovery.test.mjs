import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { recoverPopupResultFromCurrentUser } from '../src/lib/socialSignIn.js';

test('COOP popup-closed recovers a just-signed-in Firebase user', () => {
  const auth = {
    currentUser: {
      email: 'hrybovnikita@gmail.com',
      emailVerified: true,
      metadata: { lastSignInTime: new Date().toISOString() },
    },
  };
  const recovered = recoverPopupResultFromCurrentUser(auth, { code: 'auth/popup-closed-by-user' });
  assert.equal(recovered?.user?.email, 'hrybovnikita@gmail.com');
});

test('COOP recovery ignores cancelled second popups and stale users', () => {
  assert.equal(
    recoverPopupResultFromCurrentUser(
      { currentUser: { email: 'a@b.c', emailVerified: true, metadata: { lastSignInTime: new Date().toISOString() } } },
      { code: 'auth/cancelled-popup-request' },
    ),
    null,
  );
  assert.equal(
    recoverPopupResultFromCurrentUser(
      {
        currentUser: {
          email: 'a@b.c',
          emailVerified: true,
          metadata: { lastSignInTime: new Date(Date.now() - 10 * 60 * 1000).toISOString() },
        },
      },
      { code: 'auth/popup-closed-by-user' },
    ),
    null,
  );
  assert.equal(
    recoverPopupResultFromCurrentUser({ currentUser: null }, { code: 'auth/popup-closed-by-user' }),
    null,
  );
});

test('popup completion awaits Firebase result then exchanges a backend session', async () => {
  const source = await readFile(new URL('../src/lib/socialSignIn.js', import.meta.url), 'utf8');
  assert.match(source, /GOOGLE_POPUP_COOP_RECOVERED/);
  assert.match(source, /awaitGooglePopupSignInResult\(auth, popupPromise\)/);
  assert.match(source, /prepareBackendChallenge\(options\)/);
  assert.match(source, /complete\(result,/);
  assert.match(source, /beginGoogleSignInFlow\(\)/);
  assert.match(source, /forceReleaseGoogleSignInFlow/);
  const completeStart = source.indexOf('export async function completeGooglePopupSignIn');
  const completeFn = source.slice(completeStart, source.indexOf('export function isAuthCallbackRoute'));
  assert.match(completeFn, /A popup is already open/);
  assert.doesNotMatch(completeFn, /return beginRedirectSignIn\(auth, name, options, 'capacitor-native'\)/);
  assert.doesNotMatch(completeFn, /return beginRedirectSignIn\(auth, name, options, 'popup-unavailable'\)/);
});
