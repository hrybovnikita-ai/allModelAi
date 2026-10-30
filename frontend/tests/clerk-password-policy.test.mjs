import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  CLERK_DASHBOARD_PASSWORD_POLICY_CHECKLIST,
  CLERK_PASSWORD_HINT,
  CLERK_PASSWORD_MIN_LENGTH,
  clerkAuthPasswordLocalization,
  clerkPasswordMeetsMinimumLength,
} from '../src/lib/clerkPasswordPolicy.js';
import { clerkAuthLocalization } from '../src/lib/clerkAuthConfig.js';

test('simple passwords at least 8 characters pass the client hint', () => {
  assert.equal(clerkPasswordMeetsMinimumLength('password'), true);
  assert.equal(clerkPasswordMeetsMinimumLength('12345678'), true);
  assert.equal(clerkPasswordMeetsMinimumLength('allmodelai'), true);
});

test('long passwords pass the client hint without truncation', () => {
  const long = `a${'b'.repeat(200)}`;
  assert.ok(long.length > 64);
  assert.equal(clerkPasswordMeetsMinimumLength(long), true);
});

test('short passwords fail the client hint only', () => {
  assert.equal(clerkPasswordMeetsMinimumLength(''), false);
  assert.equal(clerkPasswordMeetsMinimumLength('short'), false);
  assert.equal(clerkPasswordMeetsMinimumLength('1234567'), false);
  assert.equal(CLERK_PASSWORD_MIN_LENGTH, 8);
});

test('simple passwords without complexity symbols are not rejected by the client hint', () => {
  assert.equal(clerkPasswordMeetsMinimumLength('abcdefgh'), true);
  assert.equal(clerkPasswordMeetsMinimumLength('password'), true);
  assert.equal(clerkPasswordMeetsMinimumLength('no sym!'), false);
});

test('clerk localization uses the simple password hint message', () => {
  const localization = clerkAuthLocalization();
  assert.equal(localization.unstable__errors.form_password_length_too_short, CLERK_PASSWORD_HINT);
  assert.equal(CLERK_PASSWORD_HINT, 'Use at least 8 characters.');
  const nested = clerkAuthPasswordLocalization();
  assert.match(nested.unstable__errors.passwordComplexity.minimumLength, /characters/);
});

test('clerk UI wires localization and does not add frontend complexity validators', async () => {
  const section = await readFile(new URL('../src/components/Login/LoginClerkSection.jsx', import.meta.url), 'utf8');
  assert.match(section, /clerkAuthLocalization\(\)/);
  assert.match(section, /CLERK_PASSWORD_HINT/);
  assert.match(section, /SignUp routing="hash"/);
  assert.doesNotMatch(section, /requireUppercase|requireSpecial|uppercase.*password/i);
  assert.doesNotMatch(section, /validatePassword.*complexity/i);
});

test('dashboard checklist documents manual production password policy steps', () => {
  assert.ok(CLERK_DASHBOARD_PASSWORD_POLICY_CHECKLIST.length >= 4);
  assert.ok(CLERK_DASHBOARD_PASSWORD_POLICY_CHECKLIST.some((line) => /compromised|pwned/i.test(line)));
  assert.ok(CLERK_DASHBOARD_PASSWORD_POLICY_CHECKLIST.some((line) => /uppercase|lowercase|numbers|special/i.test(line)));
});
