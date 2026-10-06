import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isMobileWebSafari,
  shouldPreferGoogleRedirectSignIn,
  shouldTryGooglePopupFirst,
} from '../src/lib/socialSignInEnv.js';

test('iPhone Safari uses popup-first (redirect is fallback only)', () => {
  const iphoneSafari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  assert.equal(isMobileWebSafari(iphoneSafari), true);
  assert.equal(shouldPreferGoogleRedirectSignIn(iphoneSafari), false);
  assert.equal(shouldTryGooglePopupFirst(iphoneSafari), true);
});

test('desktop Chrome does not prefer redirect sign-in', () => {
  const desktopChrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  assert.equal(shouldPreferGoogleRedirectSignIn(desktopChrome), false);
  assert.equal(shouldTryGooglePopupFirst(desktopChrome), true);
});

test('redirect recovery has a single bootstrap pipeline', async () => {
  const { readFile } = await import('node:fs/promises');
  const main = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const signIn = await readFile(new URL('../src/lib/socialSignIn.js', import.meta.url), 'utf8');
  const recovery = await readFile(new URL('../src/lib/googleRedirectRecovery.js', import.meta.url), 'utf8');

  assert.match(main, /runGoogleRedirectRecovery\('MainBootstrap'\)/);
  assert.match(app, /GoogleRedirectRecoveryGate/);
  assert.doesNotMatch(app, /SocialAuthRedirectHandler/);
  assert.match(signIn, /signInWithRedirect/);
  assert.match(signIn, /signInWithPopup/);
  assert.match(signIn, /beginRedirectSignIn/);
  assert.doesNotMatch(signIn, /CALLBACK_START_PATH/);
  assert.doesNotMatch(signIn, /beginGoogleRedirectFromCallback/);
  assert.match(recovery, /bootstrapGoogleRedirectRecovery/);
  assert.match(signIn, /runGoogleRedirectRecoveryPipeline/);
  assert.match(signIn, /awaiting-google-return/);
});

test('desktop popup flow remains in socialSignIn', async () => {
  const { readFile } = await import('node:fs/promises');
  const signIn = await readFile(new URL('../src/lib/socialSignIn.js', import.meta.url), 'utf8');
  assert.match(signIn, /signInWithPopup/);
});
