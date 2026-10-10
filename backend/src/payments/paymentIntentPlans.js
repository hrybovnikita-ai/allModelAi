const { subscriptionPlans } = require('../billing/plans');

const PAID_CHECKOUT_SLUGS = {
    starter: 'starter',
    pro: 'common',
    common: 'common',
    unlimited: 'plus',
    enterprise: 'plus',
    power: 'plus',
    plus: 'plus',
};

const PLAN_AMOUNTS_CENTS = {
    starter: subscriptionPlans.starter?.amount ?? 500,
    common: subscriptionPlans.common?.amount ?? 1500,
    plus: subscriptionPlans.plus?.amount ?? 3000,
};

function resolvePaidCheckoutPlan(rawPlan) {
    const slug = String(rawPlan || '').trim().toLowerCase();
    const planKey = PAID_CHECKOUT_SLUGS[slug];
    if (!planKey) return null;
    const plan = subscriptionPlans[planKey];
    if (!plan || !plan.amount) return null;
    const publicSlug = slug === 'common' ? 'pro' : slug === 'plus' ? 'unlimited' : slug;
    return { slug: publicSlug, planKey, plan, amountCents: PLAN_AMOUNTS_CENTS[planKey] ?? plan.amount };
}

module.exports = {
    PAID_CHECKOUT_SLUGS,
    PLAN_AMOUNTS_CENTS,
    resolvePaidCheckoutPlan,
};
