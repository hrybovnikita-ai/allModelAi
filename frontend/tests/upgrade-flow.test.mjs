import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = fs.readFileSync(path.join(frontendRoot, 'src/App.jsx'), 'utf8');
const dashboardSource = fs.readFileSync(path.join(frontendRoot, 'src/components/Dashboard/Dashboard.jsx'), 'utf8');
const checkoutSource = fs.readFileSync(path.join(frontendRoot, 'src/components/Checkout/Checkout.jsx'), 'utf8');
const catalogSource = fs.readFileSync(path.join(frontendRoot, 'src/lib/upgradePlansCatalog.js'), 'utf8');
const slugSource = fs.readFileSync(path.join(frontendRoot, 'src/lib/checkoutPlanSlug.js'), 'utf8');

test('upgrade route and checkout slugs are wired', () => {
  assert.match(appSource, /path="\/upgrade"/);
  assert.match(appSource, /path="\/checkout\/pro-plus"/);
  assert.match(dashboardSource, /to="\/upgrade"/);
  assert.match(dashboardSource, /Upgrade plan/);
  assert.match(checkoutSource, /checkoutPlanSlug/);
  assert.match(checkoutSource, /CheckoutPaymentMethods/);
  assert.match(catalogSource, /\$20/);
  assert.match(catalogSource, /\$40/);
  assert.match(catalogSource, /\$80/);
  assert.match(catalogSource, /2,000 requests/);
  assert.match(catalogSource, /5,000 requests/);
  assert.match(catalogSource, /12,000 requests/);
  assert.match(slugSource, /upgrade-pro/);
  assert.match(slugSource, /upgrade-ultra/);
  assert.match(slugSource, /pro_plus/);
  assert.match(checkoutSource, /Pay and subscribe/);
});

test('upgrade checkout routes stay public', () => {
  const requireAuthIdx = appSource.indexOf('<Route element={<RequireAuth />}');
  assert.ok(requireAuthIdx > 0);
  assert.ok(appSource.indexOf('path="/checkout/upgrade-plus"') < requireAuthIdx);
  assert.ok(appSource.indexOf('path="/upgrade"') > requireAuthIdx);
});
