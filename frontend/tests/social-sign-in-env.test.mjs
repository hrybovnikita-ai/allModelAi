import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isMobileWebSafari,
  shouldPreferGoogleRedirectSignIn,
} from '../src/lib/socialSignInEnv.js';

test('iPhone Safari prefers redirect sign-in', () => {
  const iphoneSafari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  assert.equal(isMobileWebSafari(iphoneSafari), true);
  assert.equal(shouldPreferGoogleRedirectSignIn(iphoneSafari), true);
});

test('desktop Chrome does not prefer redirect sign-in', () => {
  const desktopChrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  assert.equal(shouldPreferGoogleRedirectSignIn(desktopChrome), false);
});

test('social sign-in wires global redirect recovery', async () => {
  const { readFile } = await import('node:fs/promises');
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const signIn = await readFile(new URL('../src/lib/socialSignIn.js', import.meta.url), 'utf8');
  assert.match(app, /SocialAuthRedirectHandler/);
  assert.match(signIn, /getRedirectResult/);
  assert.match(signIn, /onAuthStateChanged/);
  assert.match(signIn, /resumePendingSocialRedirect/);
});
