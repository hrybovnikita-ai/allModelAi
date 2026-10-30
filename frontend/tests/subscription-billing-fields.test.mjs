import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStripeBillingAddress,
  normalizeCountryCode,
  validateBillingFields,
} from '../src/components/Checkout/billingFieldUtils.js';

test('normalizeCountryCode accepts ISO and common names', () => {
  assert.equal(normalizeCountryCode('us'), 'US');
  assert.equal(normalizeCountryCode('United States'), 'US');
  assert.equal(normalizeCountryCode('UA'), 'UA');
});

test('buildStripeBillingAddress composes Stripe billing payload', () => {
  const payload = buildStripeBillingAddress({
    firstName: 'Alex',
    middleName: 'J',
    lastName: 'Rivera',
    streetAddress: '123 Market St',
    apartment: 'Suite 9',
    city: 'San Francisco',
    stateRegion: 'CA',
    postalCode: '94103',
    country: 'United States',
  });
  assert.equal(payload.name, 'Alex J Rivera');
  assert.equal(payload.address.line1, '123 Market St');
  assert.equal(payload.address.line2, 'Suite 9');
  assert.equal(payload.address.country, 'US');
});

test('validateBillingFields requires core billing fields', () => {
  assert.match(
    validateBillingFields({ email: 'a@b.com' }),
    /cardholder name/i,
  );
  assert.equal(
    validateBillingFields({
      cardholderName: 'Alex Rivera',
      email: 'alex@example.com',
      country: 'US',
      city: 'SF',
      streetAddress: '1 Main',
      postalCode: '94103',
    }),
    '',
  );
});
