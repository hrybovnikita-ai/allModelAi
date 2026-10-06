const { subscriptionPlans } = require('../billing/plans');

const PAID_CHECKOUT_SLUGS = {
    pro: 'common',
    enterprise: 'plus',
    power: 'plus',
    common: 'common',
    plus: 'plus',
};

const PLAN_AMOUNTS_CENTS = {
    common: subscriptionPlans.common?.amount ?? 1900,
    plus: subscriptionPlans.plus?.amount ?? 4900,
};

function resolvePaidCheckoutPlan(rawPlan) {
    const slug = String(rawPlan || '').trim().toLowerCase();
    const planKey = PAID_CHECKOUT_SLUGS[slug];
    if (!planKey) return null;
    const plan = subscriptionPlans[planKey];
    if (!plan || !plan.amount) return null;
    return { slug, planKey, plan, amountCents: PLAN_AMOUNTS_CENTS[planKey] ?? plan.amount };
}

module.exports = {
    PAID_CHECKOUT_SLUGS,
    PLAN_AMOUNTS_CENTS,
    resolvePaidCheckoutPlan,
};
