const { subscriptionPlans, planAmountDecimal, normalizePlanKey } = require('../billing/plans');

const PUBLIC_FEATURES = {
    starter: [
        'Core AI models',
        '800 requests per month',
        'Standard response speed',
        'Email support',
    ],
    pro: [
        'Premium model access',
        '3,000 requests per month',
        'Priority routing',
        'Image generation',
        'Knowledge Base',
        'Priority support',
    ],
    unlimited: [
        'All connected providers',
        '6,000 requests per month',
        'Highest routing priority',
        'Image generation',
        'Deep Research & Knowledge Base',
        'Dedicated support',
    ],
    'upgrade-plus': [
        'Premium AI models',
        '2,000 requests per month',
        'Priority routing',
        'Image generation',
        'Knowledge Base',
        'Email support',
    ],
    'pro-plus': [
        'Full premium model access',
        '5,000 requests per month',
        'Priority routing & Smart Router',
        'Image generation',
        'Knowledge Base & Deep Research',
        'Priority support',
    ],
    ultra: [
        'All connected providers',
        '12,000 requests per month',
        'Highest routing priority',
        'Image generation & Code Studio',
        'Knowledge Base & workflows',
        'Dedicated support',
    ],
};

const buildPublicPlan = (slug, planKey) => {
    const plan = subscriptionPlans[planKey];
    if (!plan || !plan.amount) return null;
    const names = {
        starter: 'Starter',
        pro: 'Pro',
        unlimited: 'Unlimited',
        'upgrade-plus': 'Plus',
        'pro-plus': 'Pro+',
        ultra: 'Ultra',
    };
    return {
        slug,
        planKey,
        name: names[slug] || plan.name,
        amountCents: plan.amount,
        amountDisplay: planAmountDecimal(planKey),
        currency: 'USD',
        interval: plan.interval,
        requestLimit: plan.limit,
        features: PUBLIC_FEATURES[slug] || [],
    };
};

const getPublicCheckoutPlans = () => ({
    starter: buildPublicPlan('starter', 'starter'),
    pro: buildPublicPlan('pro', 'common'),
    unlimited: buildPublicPlan('unlimited', 'plus'),
    enterprise: buildPublicPlan('unlimited', 'plus'),
});

const getPublicCheckoutPlan = (rawSlug) => {
    const slug = String(rawSlug || '').toLowerCase();
    if (slug === 'starter') return buildPublicPlan('starter', 'starter');
    if (slug === 'pro' || slug === 'common') return buildPublicPlan('pro', 'common');
    if (slug === 'unlimited' || slug === 'enterprise' || slug === 'power') {
        return buildPublicPlan('unlimited', 'plus');
    }
    if (slug === 'upgrade-plus') return buildPublicPlan('upgrade-plus', 'upgrade_plus');
    if (slug === 'pro-plus' || slug === 'upgrade-pro') return buildPublicPlan('pro-plus', 'upgrade_pro_plus');
    if (slug === 'ultra' || slug === 'upgrade-ultra') return buildPublicPlan('ultra', 'upgrade_ultra');
    return null;
};

const planKeyFromCheckoutSlug = (rawSlug) => normalizePlanKey(rawSlug);

module.exports = {
    getPublicCheckoutPlans,
    getPublicCheckoutPlan,
    planKeyFromCheckoutSlug,
};
