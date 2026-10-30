import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const checkoutSource = readFileSync(join(root, 'src/components/Checkout/Checkout.jsx'), 'utf8');

test('Checkout does not import MockCheckoutForm for unconfigured payments', () => {
  assert.doesNotMatch(checkoutSource, /import MockCheckoutForm/);
  assert.match(checkoutSource, /Secure payment form is not available yet/);
  assert.match(checkoutSource, /CheckoutPaymentUnavailable/);
  assert.match(checkoutSource, /showTestModeBanner=\{Boolean\(checkoutInfo\?\.showTestModeBanner\)\}/);
});

test('Production Stripe form still used when Stripe is primary', () => {
  assert.match(checkoutSource, /ProductionStripeCheckoutForm/);
  assert.match(checkoutSource, /useStripeProduction/);
});
