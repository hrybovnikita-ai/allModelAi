import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Paddle checkout UI wiring', async (t) => {
  await t.test('Checkout imports Paddle button and success polls subscription only', () => {
    const checkout = readFileSync(path.join(root, 'src/components/Checkout/Checkout.jsx'), 'utf8');
    const success = readFileSync(path.join(root, 'src/components/Checkout/CheckoutSuccess.jsx'), 'utf8');
    const lib = readFileSync(path.join(root, 'src/lib/paddleCheckout.js'), 'utf8');
    assert.match(checkout, /PaddleCheckoutButton/);
    assert.match(checkout, /paddleCheckoutEnabled/);
    assert.match(lib, /@paddle\/paddle-js/);
    assert.match(success, /paymentProvider === 'paddle'/);
    assert.doesNotMatch(success, /\/api\/payments\/paddle\/confirm/);
  });
});
