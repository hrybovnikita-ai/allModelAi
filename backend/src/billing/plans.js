const subscriptionPlans = {
    free: { name: 'User', amount: 0, interval: 'month', limit: 5000, models: ['smart', 'gemini', 'gpt', 'llama', 'deepseek', 'mistral', 'qwen', 'cloudflare'] },
    week: { name: 'Weekly', amount: 599, interval: 'week', limit: 500, models: ['smart', 'gemini', 'gpt', 'llama', 'deepseek', 'cloudflare'] },
    common: { name: 'Pro Monthly', amount: 1900, interval: 'month', limit: 3000, models: ['smart', 'gemini', 'gpt', 'claude', 'llama', 'grok', 'copilot', 'perplexity', 'kimi', 'deepseek', 'mistral', 'qwen', 'cohere', 'cloudflare'] },
    plus: { name: 'Power Monthly', amount: 4900, interval: 'month', limit: 12000, models: ['all'] },
};

const normalizePlanKey = (value) => (
    { starter: 'free', developer: 'free', pro: 'common', monthly: 'common', power: 'plus', enterprise: 'plus' }[String(value || '').toLowerCase()]
    || String(value || '').toLowerCase()
);

/** Public checkout slug (pro, power, week) for API/UI — internal DB key may be common/plus. */
const planSlugForKey = (planKey) => {
    const key = normalizePlanKey(planKey);
    if (key === 'common') return 'pro';
    if (key === 'plus') return 'power';
    if (key === 'week') return 'week';
    if (key === 'free') return 'free';
    return key;
};

/** UI labels for stored plan keys and internal billing keys. */
const PLAN_UI_LABELS = {
    free: 'Common',
    common: 'Common',
    pro: 'Pro Monthly',
    plus: 'Power Monthly',
    power: 'Power Monthly',
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

/** Value stored in subscription_details.plan (checkout slug: pro, power, week, free). */
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
