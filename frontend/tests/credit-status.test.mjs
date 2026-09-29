import assert from 'node:assert/strict';
import { isCompleteCreditStatus, normalizeCreditStatus } from '../src/lib/creditStatus.js';

assert.equal(
    normalizeCreditStatus({ remaining: 10, subscriptionStatus: 'free', hasSubscription: false })?.remaining,
    10,
);
assert.equal(isCompleteCreditStatus({ requestsRemaining: 5, plan: 'free' }), true);
assert.equal(isCompleteCreditStatus({ plan: 'free' }), false);
