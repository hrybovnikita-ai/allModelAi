import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { validatePasswordEnrollmentForm } from '../src/lib/authValidation.js';

test('password enrollment validation requires confirm match and current password when enabled', () => {
  assert.equal(
    validatePasswordEnrollmentForm({ newPassword: 'short', confirmPassword: 'short' }).message,
    'Password must contain at least 8 characters.',
  );
  assert.equal(
    validatePasswordEnrollmentForm({
      newPassword: '12345678',
      confirmPassword: '87654321',
    }).message,
    'Passwords do not match.',
  );
  assert.equal(
    validatePasswordEnrollmentForm(
      { newPassword: '12345678', confirmPassword: '12345678' },
      { passwordEnabled: true },
    ).message,
    'Enter your current password.',
  );
  assert.equal(
    validatePasswordEnrollmentForm(
      {
        newPassword: '12345678',
        confirmPassword: '12345678',
        currentPassword: 'old-pass',
      },
      { passwordEnabled: true },
    ).ok,
    true,
  );
});

test('settings security UI exposes password enrollment for signed-in users', async () => {
  const settings = await readFile(new URL('../src/components/Settings/Settings.jsx', import.meta.url), 'utf8');
  const security = await readFile(new URL('../src/components/Settings/AccountSecurity.jsx', import.meta.url), 'utf8');
  const form = await readFile(new URL('../src/components/Settings/SetAllModelAiPasswordForm.jsx', import.meta.url), 'utf8');
  assert.match(settings, /AccountSecurity/);
  assert.match(security, /fetchAccountSecurity/);
  assert.match(security, /SetAllModelAiPasswordForm/);
  assert.match(form, /setAccountPassword/);
  assert.match(form, /validatePasswordEnrollmentForm/);
});

test('login uses generic credential errors without password-setup enumeration', async () => {
  const login = await readFile(new URL('../src/components/Login/Login.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(login, /PASSWORD_SETUP_REQUIRED/);
  assert.doesNotMatch(login, /needsPasswordSetup/);
  assert.doesNotMatch(login, /PASSWORD_HASH_MISSING/);
  assert.match(login, /Unable to sign in\. Check your details or reset your password\./);
  assert.doesNotMatch(login, /Invalid email or password/);
  assert.match(login, /forgot-password/);
  assert.doesNotMatch(login, /Used Google before\?/);
});

test('login hints forgot-password and Google for password recovery', async () => {
  const login = await readFile(new URL('../src/components/Login/Login.jsx', import.meta.url), 'utf8');
  assert.match(login, /forgot-password/);
  assert.match(login, /Continue with Google/);
});

test('account security API client uses authenticated routes', async () => {
  const client = await readFile(new URL('../src/lib/accountSecurity.js', import.meta.url), 'utf8');
  assert.match(client, /account\/security/);
  assert.match(client, /account\/password/);
  assert.match(client, /readJsonBody/);
  assert.doesNotMatch(client, /await import\(/);
});
