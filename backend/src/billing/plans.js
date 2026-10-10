const subscriptionPlans = {
    free: {
        name: 'User',
        amount: 0,
        interval: 'month',
        limit: 5000,
        models: ['smart', 'gemini', 'gpt', 'llama', 'deepseek', 'mistral', 'qwen', 'cloudflare'],
    },
    week: {
        name: 'Weekly',
        amount: 599,
        interval: 'week',
        limit: 500,
        models: ['smart', 'gemini', 'gpt', 'llama', 'deepseek', 'cloudflare'],
    },
    starter: {
        name: 'Starter Monthly',
        amount: 500,
        interval: 'month',
        limit: 800,
        models: ['smart', 'gemini', 'gpt', 'llama', 'deepseek', 'mistral', 'cloudflare'],
    },
    common: {
        name: 'Pro Monthly',
        amount: 1500,
        interval: 'month',
        limit: 3000,
        models: [
            'smart', 'gemini', 'gpt', 'claude', 'llama', 'grok', 'copilot', 'perplexity', 'kimi',
            'deepseek', 'mistral', 'qwen', 'cohere', 'cloudflare',
        ],
    },
    plus: {
        name: 'Unlimited Monthly',
        amount: 3000,
        interval: 'month',
        limit: 6000,
        models: ['all'],
    },
};

const normalizePlanKey = (value) => (
    {
        starter: 'starter',
        pro: 'common',
        monthly: 'common',
        unlimited: 'plus',
        power: 'plus',
        enterprise: 'plus',
        developer: 'free',
    }[String(value || '').toLowerCase()]
    || String(value || '').toLowerCase()
);

/** Public checkout slug stored in subscription_details.plan */
const planSlugForKey = (planKey) => {
    const key = normalizePlanKey(planKey);
    if (key === 'starter') return 'starter';
    if (key === 'common') return 'pro';
    if (key === 'plus') return 'unlimited';
    if (key === 'week') return 'week';
    if (key === 'free') return 'free';
    return key;
};

const PLAN_UI_LABELS = {
    free: 'Common',
    starter: 'Starter',
    common: 'Pro',
    pro: 'Pro',
    plus: 'Unlimited',
    unlimited: 'Unlimited',
    power: 'Unlimited',
    week: 'Weekly',
    weekly: 'Weekly',
    developer: 'Developer',
};

const planDisplayName = (planKey, { isDeveloper = false, hasPaidSubscription = false, storedPlanKey = null } = {}) => {
    let stored = storedPlanKey ? String(storedPlanKey).toLowerCase() : '';
    if (stored === 'common' || stored === 'plus') stored = planSlugForKey(stored);
    if (stored && PLAN_UI_LABELS[stored]) return PLAN_UI_LABELS[stored];
    const key = normalizePlanKey(planKey);
    if (key === 'free' && isDeveloper && !hasPaidSubscription) return PLAN_UI_LABELS.developer;
    if (PLAN_UI_LABELS[key]) return PLAN_UI_LABELS[key];
    const plan = subscriptionPlans[key];
    return plan?.name || stored || key;
};

const periodEndFor = (interval) => new Date(Date.now() + (interval === 'week' ? 7 : 30) * 24 * 60 * 60 * 1000).toISOString();

const planAmountDecimal = (planKey) => {
    const plan = subscriptionPlans[normalizePlanKey(planKey)];
    if (!plan || !plan.amount) return null;
    return (plan.amount / 100).toFixed(2);
};

const planStorageValue = (planKey) => planSlugForKey(normalizePlanKey(planKey));

module.exports = {
    subscriptionPlans,
    normalizePlanKey,
    planSlugForKey,
    PLAN_UI_LABELS,
    planDisplayName,
    planStorageValue,
    periodEndFor,
    planAmountDecimal,
};
