import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('Pro subscription constants match WayForPay Pro product', () => {
  const source = readFileSync(join(root, 'src/lib/proSubscription.js'), 'utf8');
  assert.match(source, /PRO_SUBSCRIPTION_PRICE_LABEL = '\$9\.99'/);
  assert.match(source, /AllModelAI Pro Subscription/);
  assert.match(source, /ba5962ea4be5f/);
});

test('Pricing sends paid plans through authenticated checkout', () => {
  const pricing = readFileSync(join(root, 'src/components/Pricing/Pricing.jsx'), 'utf8');
  assert.match(pricing, /savePendingCheckout/);
  assert.match(pricing, /\/checkout\?plan=pro/);
  assert.doesNotMatch(pricing, /proSubscribe: true/);
});

test('Dashboard paid models use ProSubscribeButton not raw checkout link', () => {
  const dashboard = readFileSync(join(root, 'src/components/Dashboard/Dashboard.jsx'), 'utf8');
  assert.match(dashboard, /ProSubscribeButton/);
  assert.doesNotMatch(dashboard, /model-open--subscribe" to=/);
});
