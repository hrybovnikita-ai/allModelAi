import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('checkout summary uses horizontal feature rows', () => {
  const css = readFileSync(join(root, 'src/components/Checkout/CheckoutTheme.css'), 'utf8');
  assert.match(css, /checkout-summary-list--premium li/);
  assert.match(css, /flex-direction: row/);
});

test('subscription checkout does not embed AI credit marketplace', () => {
  const checkout = readFileSync(join(root, 'src/components/Checkout/Checkout.jsx'), 'utf8');
  assert.doesNotMatch(checkout, /CheckoutAiCreditPackages/);
  assert.match(readFileSync(join(root, 'src/App.jsx'), 'utf8'), /checkout\/credits/);
});

test('pricing cards use plan query checkout URLs', () => {
  const pricing = readFileSync(join(root, 'src/components/Pricing/Pricing.jsx'), 'utf8');
  assert.match(pricing, /\/checkout\?plan=pro/);
  assert.match(pricing, /\/checkout\?plan=starter/);
  assert.match(pricing, /\/checkout\?plan=unlimited/);
});
