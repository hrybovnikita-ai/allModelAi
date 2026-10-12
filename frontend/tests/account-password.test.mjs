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
  assert.match(settings, /AccountSecurity/);
  assert.match(security, /fetchAccountSecurity/);
  assert.match(security, /setAccountPassword/);
  assert.match(security, /validatePasswordEnrollmentForm/);
});

test('login surfaces PASSWORD_SETUP_REQUIRED guidance', async () => {
  const login = await readFile(new URL('../src/components/Login/Login.jsx', import.meta.url), 'utf8');
  assert.match(login, /PASSWORD_SETUP_REQUIRED/);
  assert.match(login, /needsPasswordSetup/);
  assert.match(login, /settings#settings-security/);
});

test('login hints forgot-password path for Google-only accounts', async () => {
  const login = await readFile(new URL('../src/components/Login/Login.jsx', import.meta.url), 'utf8');
  assert.match(login, /forgot-password/);
  assert.match(login, /never use your Google password/i);
});

test('account security API client uses authenticated routes', async () => {
  const client = await readFile(new URL('../src/lib/accountSecurity.js', import.meta.url), 'utf8');
  assert.match(client, /account\/security/);
  assert.match(client, /account\/password/);
  assert.match(client, /readJsonBody/);
  assert.doesNotMatch(client, /await import\(/);
});
