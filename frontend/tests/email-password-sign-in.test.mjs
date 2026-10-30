import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('email password sign-in tries backend then Firebase fallback', async () => {
  const source = await readFile(new URL('../src/lib/emailPasswordSignIn.js', import.meta.url), 'utf8');
  assert.match(source, /authPost\('login'/);
  assert.match(source, /signInWithEmailAndPassword/);
  assert.match(source, /exchangeSocialSession/);
  assert.doesNotMatch(source, /passwordSync/);
  assert.match(source, /PASSWORD_SETUP_REQUIRED/);
  assert.match(source, /isGoogleOnlyPasswordSetup\(backendError\)/);
  assert.match(source, /INVALID_LOGIN_CREDENTIALS/);
  assert.doesNotMatch(source, /stashPendingEmailPasswordLink/);
  assert.doesNotMatch(source, /localStorage/);
});

test('password linking uses EmailAuthProvider after explicit Settings confirmation', async () => {
  const linker = await readFile(new URL('../src/lib/linkEmailPassword.js', import.meta.url), 'utf8');
  const form = await readFile(new URL('../src/components/Settings/SetAllModelAiPasswordForm.jsx', import.meta.url), 'utf8');
  const social = await readFile(new URL('../src/lib/socialSignIn.js', import.meta.url), 'utf8');
  assert.match(linker, /EmailAuthProvider\.credential/);
  assert.match(linker, /linkWithCredential/);
  assert.match(linker, /reauthenticateWithPopup/);
  assert.doesNotMatch(linker, /localStorage/);
  assert.doesNotMatch(linker, /sessionStorage/);
  assert.doesNotMatch(linker, /stashPending/);
  assert.match(form, /I confirm I want to add Email\/Password/);
  assert.match(form, /linkEmailPasswordToCurrentFirebaseUser/);
  assert.doesNotMatch(social, /enrollPendingEmailPasswordAfterSocialLogin/);
});

test('registration does not await or create a second Firebase password account', async () => {
  const login = await readFile(new URL('../src/components/Login/Login.jsx', import.meta.url), 'utf8');
  assert.match(login, /signInWithEmailPasswordAllModelAI/);
  assert.doesNotMatch(login, /syncFirebaseEmailAccountAfterRegister/);
  assert.match(login, /passwordSetupHint/);
});
