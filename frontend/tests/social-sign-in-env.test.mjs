import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isIosTouchDevice,
  isMobileWebSafari,
  shouldPreferGoogleRedirectSignIn,
  shouldTryGooglePopupFirst,
} from '../src/lib/socialSignInEnv.js';

const iphoneSafari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const desktopChrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

test('iPhone Safari always prefers redirect sign-in', () => {
  assert.equal(isMobileWebSafari(iphoneSafari), true);
  assert.equal(isIosTouchDevice(iphoneSafari), true);
  assert.equal(shouldPreferGoogleRedirectSignIn(iphoneSafari), true);
  assert.equal(shouldTryGooglePopupFirst(iphoneSafari), false);
});

test('desktop Chrome uses popup-first sign-in', () => {
  assert.equal(shouldPreferGoogleRedirectSignIn(desktopChrome), false);
  assert.equal(shouldTryGooglePopupFirst(desktopChrome), true);
});

test('redirect recovery has a single bootstrap pipeline', async () => {
  const { readFile } = await import('node:fs/promises');
  const main = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const signIn = await readFile(new URL('../src/lib/socialSignIn.js', import.meta.url), 'utf8');
  const recovery = await readFile(new URL('../src/lib/googleRedirectRecovery.js', import.meta.url), 'utf8');
  const login = await readFile(new URL('../src/components/Login/Login.jsx', import.meta.url), 'utf8');

  assert.match(main, /runGoogleRedirectRecovery\('MainBootstrap'\)/);
  assert.match(app, /GoogleRedirectRecoveryGate/);
  assert.match(signIn, /startGoogleRedirectSignIn/);
  assert.match(signIn, /signInWithRedirect/);
  assert.match(login, /shouldPreferGoogleRedirectSignIn/);
  assert.match(login, /startGoogleRedirectSignIn/);
  assert.match(recovery, /bootstrapGoogleRedirectRecovery/);
  assert.match(signIn, /runGoogleRedirectRecoveryPipeline/);
  assert.match(signIn, /awaiting-google-return/);
});

test('desktop popup flow remains in socialSignIn', async () => {
  const { readFile } = await import('node:fs/promises');
  const signIn = await readFile(new URL('../src/lib/socialSignIn.js', import.meta.url), 'utf8');
  assert.match(signIn, /signInWithPopup/);
  assert.match(signIn, /launchGooglePopupSignIn/);
});
