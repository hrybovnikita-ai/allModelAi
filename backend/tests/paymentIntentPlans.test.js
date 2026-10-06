const test = require('node:test');
const assert = require('node:assert/strict');
const { resolvePaidCheckoutPlan, PLAN_AMOUNTS_CENTS } = require('../src/payments/paymentIntentPlans');

test('paymentIntentPlans resolves server-side amounts only', () => {
    const pro = resolvePaidCheckoutPlan('pro');
    assert.ok(pro);
    assert.equal(pro.planKey, 'common');
    assert.equal(pro.amountCents, PLAN_AMOUNTS_CENTS.common);
    assert.equal(pro.amountCents, 1900);

    const enterprise = resolvePaidCheckoutPlan('enterprise');
    assert.ok(enterprise);
    assert.equal(enterprise.planKey, 'plus');
    assert.equal(enterprise.amountCents, 4900);

    assert.equal(resolvePaidCheckoutPlan('developer'), null);
    assert.equal(resolvePaidCheckoutPlan(''), null);
    assert.equal(resolvePaidCheckoutPlan('invalid'), null);
});
