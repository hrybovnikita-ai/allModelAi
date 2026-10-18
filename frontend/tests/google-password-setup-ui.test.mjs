import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('dashboard no longer shows the AllModelAI password setup banner', async () => {
  const dashboard = await readFile(
    new URL('../src/components/Dashboard/Dashboard.jsx', import.meta.url),
    'utf8',
  );
  const enhancements = await readFile(
    new URL('../src/components/Dashboard/DashboardEnhancements.css', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(dashboard, /SetAllModelAiPasswordForm/);
  assert.doesNotMatch(dashboard, /showPasswordSetupHint/);
  assert.doesNotMatch(dashboard, /dashboard-password-setup/);
  assert.doesNotMatch(dashboard, /You signed in with Google/);
  assert.doesNotMatch(dashboard, /Set a separate AllModelAI password/);
  assert.doesNotMatch(dashboard, /SocialAuth\.css/);
  assert.doesNotMatch(enhancements, /dashboard-password-setup/);
  assert.match(dashboard, /Welcome, \{user\.name/);
});

test('account security keeps the shared password enrollment form', async () => {
  const security = await readFile(
    new URL('../src/components/Settings/AccountSecurity.jsx', import.meta.url),
    'utf8',
  );
  const form = await readFile(
    new URL('../src/components/Settings/SetAllModelAiPasswordForm.jsx', import.meta.url),
    'utf8',
  );
  assert.match(security, /SetAllModelAiPasswordForm/);
  assert.match(form, /never your Google password/i);
  assert.match(form, /setAccountPassword/);
});
