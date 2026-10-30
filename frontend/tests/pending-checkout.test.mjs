import test from 'node:test';
import assert from 'node:assert/strict';
import { checkoutPathForPlan, resolvePostAuthDestination, safeCheckoutReturnPath, savePendingCheckout, clearPendingCheckout, peekPendingCheckoutPath } from '../src/lib/pendingCheckout.js';

test('checkout paths only allow starter, pro, and unlimited', () => {
  assert.equal(checkoutPathForPlan('starter'), '/checkout?plan=starter');
  assert.equal(checkoutPathForPlan('pro'), '/checkout?plan=pro');
  assert.equal(checkoutPathForPlan('unlimited'), '/checkout?plan=unlimited');
  assert.equal(checkoutPathForPlan('https://evil.example'), null);
  assert.equal(safeCheckoutReturnPath('//evil.example/checkout?plan=pro'), null);
  assert.equal(safeCheckoutReturnPath('/dashboard'), null);
  assert.equal(safeCheckoutReturnPath('/checkout?plan=pro'), '/checkout?plan=pro');
});

test('pending checkout survives refresh and is cleared after use', () => {
  const store = new Map();
  globalThis.sessionStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
  };
  clearPendingCheckout();
  savePendingCheckout('pro');
  assert.equal(peekPendingCheckoutPath(), '/checkout?plan=pro');
  assert.equal(resolvePostAuthDestination(null), '/checkout?plan=pro');
  assert.equal(resolvePostAuthDestination('/checkout?plan=starter'), '/checkout?plan=starter');
  clearPendingCheckout();
  assert.equal(peekPendingCheckoutPath(), null);
});
