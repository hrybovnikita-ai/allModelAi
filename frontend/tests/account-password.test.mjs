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

test('account security API client uses authenticated routes', async () => {
  const client = await readFile(new URL('../src/lib/accountSecurity.js', import.meta.url), 'utf8');
  assert.match(client, /account\/security/);
  assert.match(client, /account\/password/);
});
