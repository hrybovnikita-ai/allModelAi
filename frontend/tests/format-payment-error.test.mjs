import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPaymentError } from '../src/lib/formatPaymentError.js';

test('formatPaymentError hides server env var names', () => {
  const msg = formatPaymentError({
    message: 'Stripe is not configured: STRIPE_SECRET_KEY',
    missingEnvVars: ['STRIPE_SECRET_KEY'],
  });
  assert.doesNotMatch(msg, /STRIPE_/);
  assert.match(msg, /temporarily unavailable/i);
});

test('formatPaymentError prefers userMessage', () => {
  assert.equal(formatPaymentError({ userMessage: 'Please try again later.' }), 'Please try again later.');
});
