import assert from 'node:assert/strict';
import test from 'node:test';
import { socialError } from '../src/lib/socialSession.js';

test('socialError maps backend auth API failures separately from Firebase network errors', () => {
  assert.match(
    socialError({ code: 'AUTH_API_NETWORK_ERROR' }),
    /AllModelAI sign-in service/i,
  );
  assert.match(
    socialError({ code: 'auth/network-request-failed' }),
    /Could not reach the provider/i,
  );
  assert.match(
    socialError({ code: 'auth/unauthorized-domain', message: 'auth/unauthorized-domain' }),
    /not authorized/i,
  );
});
