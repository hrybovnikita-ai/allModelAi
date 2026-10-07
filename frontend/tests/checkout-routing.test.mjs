import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = fs.readFileSync(path.join(frontendRoot, 'src/App.jsx'), 'utf8');
const pricingSource = fs.readFileSync(path.join(frontendRoot, 'src/components/Pricing/Pricing.jsx'), 'utf8');
const stripeCheckoutSource = fs.readFileSync(path.join(frontendRoot, 'src/components/Checkout/StripePlanCheckout.jsx'), 'utf8');
const checkoutSource = fs.readFileSync(path.join(frontendRoot, 'src/components/Checkout/Checkout.jsx'), 'utf8');

test('checkout routes are public (outside RequireAuth)', () => {
  const requireAuthIdx = appSource.indexOf('<Route element={<RequireAuth />}');
  assert.ok(requireAuthIdx > 0);
  assert.ok(appSource.indexOf('path="/checkout/pro"') < requireAuthIdx);
  assert.ok(appSource.indexOf('path="/checkout/enterprise"') < requireAuthIdx);
  assert.ok(appSource.indexOf('path="/checkout/success"') < requireAuthIdx);
  assert.ok(appSource.indexOf('path="/checkout/cancel"') < requireAuthIdx);
});

test('checkout page does not mix WayForPay and Stripe copy', () => {
  assert.doesNotMatch(checkoutSource, /Complete your subscription on Stripe/);
  assert.doesNotMatch(checkoutSource, /Configure Stripe test keys/);
  assert.doesNotMatch(checkoutSource, /WAYFORPAY TEST CHECKOUT/);
  assert.match(checkoutSource, /primaryProvider/);
});

test('pricing paid plans navigate to dedicated checkout paths', () => {
  assert.match(pricingSource, /navigate\('\/checkout\/pro'\)/);
  assert.match(pricingSource, /navigate\('\/checkout\/enterprise'\)/);
});

test('Stripe checkout uses PaymentElement via @stripe/react-stripe-js', () => {
  assert.match(stripeCheckoutSource, /@stripe\/react-stripe-js/);
  assert.match(stripeCheckoutSource, /PaymentElement/);
  assert.match(stripeCheckoutSource, /confirmPayment/);
  assert.doesNotMatch(stripeCheckoutSource, /@stripe\/react-stripe-js\/checkout/);
});
