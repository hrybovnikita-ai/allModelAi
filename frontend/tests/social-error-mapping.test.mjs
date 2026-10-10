import assert from 'node:assert/strict';
import test from 'node:test';
import { isRetryableSocialSignInError, socialError } from '../src/lib/socialSession.js';

test('isRetryableSocialSignInError covers Firebase and backend network failures', () => {
  assert.equal(isRetryableSocialSignInError({ code: 'auth/network-request-failed' }), true);
  assert.equal(isRetryableSocialSignInError({ code: 'AUTH_API_NETWORK_ERROR' }), true);
  assert.equal(isRetryableSocialSignInError({ code: 'auth/popup-closed-by-user' }), false);
});

test('socialError maps backend auth API failures separately from Firebase network errors', () => {
  assert.match(
    socialError({ code: 'AUTH_API_NETWORK_ERROR' }),
    /AllModelAI sign-in service/i,
  );
  assert.match(
    socialError({ code: 'auth/network-request-failed' }),
    /Firebase|Google sign-in/i,
  );
  assert.match(
    socialError({ code: 'auth/unauthorized-domain', message: 'auth/unauthorized-domain' }),
    /not authorized/i,
  );
});
