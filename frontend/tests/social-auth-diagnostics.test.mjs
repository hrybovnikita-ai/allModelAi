import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeRedirectRecoveryFailure } from '../src/lib/socialAuthDiagnostics.js';
import { socialError } from '../src/lib/socialSession.js';

test('redirect recovery failure message is user-friendly in production', () => {
  const message = describeRedirectRecoveryFailure({
    consumer: 'MainBootstrap',
    reason: 'redirect-result-null',
    authDomain: 'allmodelai.firebaseapp.com',
  });
  assert.doesNotMatch(message, /consumer=/);
  assert.doesNotMatch(message, /on this device/i);
  assert.match(message, /try again/i);
});

test('socialError maps REDIRECT_RESULT_MISSING without technical overlay text', () => {
  const message = socialError({ code: 'REDIRECT_RESULT_MISSING' });
  assert.match(message, /try again/i);
  assert.doesNotMatch(message, /Unhandled/i);
});

test('socialError maps verified-email requirement without GitHub-specific copy', () => {
  const message = socialError({ code: 'VERIFIED_EMAIL_REQUIRED' });
  assert.match(message, /Verify an email/i);
  assert.doesNotMatch(message, /GitHub/i);
});
