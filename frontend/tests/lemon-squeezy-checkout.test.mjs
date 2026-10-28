import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('frontend calls Lemon Squeezy create-checkout endpoint', async () => {
  const lib = await readFile(new URL('../src/lib/lemonSqueezyCheckout.js', import.meta.url), 'utf8');
  assert.match(lib, /\/api\/payments\/create-checkout/);
  assert.match(lib, /checkoutUrl/);
});

test('dashboard handles payment=success query', async () => {
  const dashboard = await readFile(
    new URL('../src/components/Dashboard/Dashboard.jsx', import.meta.url),
    'utf8',
  );
  assert.match(dashboard, /payment.*success/);
  assert.match(dashboard, /loadSubscription/);
});
