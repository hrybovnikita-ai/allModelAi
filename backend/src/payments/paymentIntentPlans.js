const { subscriptionPlans } = require('../billing/plans');

const PAID_CHECKOUT_SLUGS = {
    starter: 'starter',
    pro: 'common',
    common: 'common',
    unlimited: 'plus',
    enterprise: 'plus',
    power: 'plus',
    plus: 'plus',
    'upgrade-plus': 'upgrade_plus',
    'upgrade-pro': 'upgrade_pro_plus',
    'pro-plus': 'upgrade_pro_plus',
    ultra: 'upgrade_ultra',
    'upgrade-ultra': 'upgrade_ultra',
};

const PLAN_AMOUNTS_CENTS = {
    starter: subscriptionPlans.starter?.amount ?? 500,
    common: subscriptionPlans.common?.amount ?? 999,
    plus: subscriptionPlans.plus?.amount ?? 3000,
    upgrade_plus: subscriptionPlans.upgrade_plus?.amount ?? 2000,
    upgrade_pro_plus: subscriptionPlans.upgrade_pro_plus?.amount ?? 4000,
    upgrade_ultra: subscriptionPlans.upgrade_ultra?.amount ?? 8000,
};

const SLUG_NORMALIZE = {
    proplus: 'pro-plus',
    pro_plus: 'pro-plus',
    upgrade_pro: 'pro-plus',
    upgrade_plus: 'upgrade-plus',
    upgrade_ultra: 'ultra',
};

function normalizePaidCheckoutSlug(rawPlan) {
    let slug = String(rawPlan || '').trim().toLowerCase().replace(/_/g, '-');
    if (SLUG_NORMALIZE[slug.replace(/-/g, '_')] != null) {
        slug = SLUG_NORMALIZE[slug.replace(/-/g, '_')];
    }
    if (SLUG_NORMALIZE[slug.replace(/-/g, '')] != null) {
        slug = SLUG_NORMALIZE[slug.replace(/-/g, '')];
    }
    if (slug === 'proplus') slug = 'pro-plus';
    return slug;
}

function resolvePaidCheckoutPlan(rawPlan) {
    const slug = normalizePaidCheckoutSlug(rawPlan);
    const planKey = PAID_CHECKOUT_SLUGS[slug];
    if (!planKey) return null;
    const plan = subscriptionPlans[planKey];
    if (!plan || !plan.amount) return null;
    let publicSlug = slug;
    if (slug === 'common') publicSlug = 'pro';
    else if (slug === 'plus') publicSlug = 'unlimited';
    else if (planKey === 'upgrade_plus') publicSlug = 'upgrade-plus';
    else if (planKey === 'upgrade_pro_plus') publicSlug = 'pro-plus';
    else if (planKey === 'upgrade_ultra') publicSlug = 'ultra';
    return { slug: publicSlug, planKey, plan, amountCents: PLAN_AMOUNTS_CENTS[planKey] ?? plan.amount };
}

function resolveSubscriptionPlanInput(rawPlan) {
    const paid = resolvePaidCheckoutPlan(rawPlan);
    if (paid) {
        return { planKey: paid.planKey, plan: paid.plan, checkoutSlug: paid.slug };
    }
    const { normalizePlanKey, subscriptionPlans: plans } = require('../billing/plans');
    const planKey = normalizePlanKey(normalizePaidCheckoutSlug(rawPlan) || rawPlan);
    const plan = plans[planKey];
    if (!plan) return null;
    return { planKey, plan, checkoutSlug: normalizePaidCheckoutSlug(rawPlan) || rawPlan };
}

module.exports = {
    PAID_CHECKOUT_SLUGS,
    PLAN_AMOUNTS_CENTS,
    normalizePaidCheckoutSlug,
    resolvePaidCheckoutPlan,
    resolveSubscriptionPlanInput,
};
