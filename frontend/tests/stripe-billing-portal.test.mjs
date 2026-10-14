import test from 'node:test';
import assert from 'node:assert/strict';
import { subscriptionMatchesCheckoutPlan } from '../src/lib/stripeSubscriptionPlanMatch.js';

test('subscriptionMatchesCheckoutPlan', async (t) => {
  await t.test('matches pro and common aliases', () => {
    assert.equal(
      subscriptionMatchesCheckoutPlan({ hasSubscription: true, active: true, planKey: 'pro' }, 'pro'),
      true,
    );
    assert.equal(
      subscriptionMatchesCheckoutPlan({ hasSubscription: true, active: true, plan: 'common' }, 'pro'),
      true,
    );
  });

  await t.test('inactive subscription does not match', () => {
    assert.equal(
      subscriptionMatchesCheckoutPlan({ hasSubscription: true, active: false, planKey: 'pro' }, 'pro'),
      false,
    );
  });
});
