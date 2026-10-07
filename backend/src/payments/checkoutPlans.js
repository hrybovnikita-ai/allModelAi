const { subscriptionPlans, planAmountDecimal, normalizePlanKey } = require('../billing/plans');

const PUBLIC_FEATURES = {
    pro: [
        'Access to premium models',
        '3,000 requests per month',
        'Priority AI routing',
        'Deep Research',
        'Knowledge Base',
        'Image generation',
        'Email support',
    ],
    enterprise: [
        'Every connected provider',
        '12,000 requests per month',
        'Arena, workflows and analytics',
        'Dedicated support',
        'Custom SLA options',
        'Deep Research & Knowledge Base',
        'Image generation',
    ],
};

const buildPublicPlan = (slug, planKey) => {
    const plan = subscriptionPlans[planKey];
    if (!plan) return null;
    return {
        slug,
        planKey,
        name: slug === 'pro' ? 'Pro' : 'Enterprise',
        amountCents: plan.amount,
        amountDisplay: planAmountDecimal(planKey),
        currency: 'USD',
        interval: plan.interval,
        requestLimit: plan.limit,
        features: PUBLIC_FEATURES[slug] || [],
    };
};

const getPublicCheckoutPlans = () => ({
    pro: buildPublicPlan('pro', 'common'),
    enterprise: buildPublicPlan('enterprise', 'plus'),
});

const getPublicCheckoutPlan = (rawSlug) => {
    const slug = String(rawSlug || '').toLowerCase();
    if (slug === 'pro' || slug === 'common') return buildPublicPlan('pro', 'common');
    if (slug === 'enterprise' || slug === 'plus' || slug === 'power') {
        return buildPublicPlan('enterprise', 'plus');
    }
    return null;
};

const planKeyFromCheckoutSlug = (rawSlug) => normalizePlanKey(rawSlug);

module.exports = {
    getPublicCheckoutPlans,
    getPublicCheckoutPlan,
    planKeyFromCheckoutSlug,
};
