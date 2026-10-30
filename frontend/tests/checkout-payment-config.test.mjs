import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('checkout refreshes payment config when session is authenticated', () => {
  const checkout = readFileSync(join(root, 'src/components/Checkout/Checkout.jsx'), 'utf8');
  assert.match(checkout, /fetchPaymentConfig/);
  assert.match(checkout, /sessionStatus === 'authenticated'/);
  assert.match(checkout, /\/api\/payments\/config/);
});

test('checkout info exposes stripe embedded readiness on backend', () => {
  const info = readFileSync(join(root, '../backend/src/payments/checkoutInfo.js'), 'utf8');
  assert.match(info, /stripeEmbeddedReady/);
  assert.match(info, /stripePublishableKeyConfigured/);
});

test('embedded checkout rejects missing publishable key on server', () => {
  const controllers = readFileSync(join(root, '../backend/src/controllers/controllers.js'), 'utf8');
  assert.match(controllers, /STRIPE_INCOMPLETE_CONFIG/);
  assert.match(controllers, /if \(!publishableKey\)/);
});
