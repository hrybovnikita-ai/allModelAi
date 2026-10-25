const { assertValidCreditPackageId, getPublicCreditPackage } = require('../billing/aiCreditPackages');
const { normalizePlanKey, subscriptionPlans } = require('../billing/plans');

const AI_CREDIT_PLAN_PREFIX = 'ai_credit:';

function isAiCreditPlanKey(planKey) {
    return String(planKey || '').startsWith(AI_CREDIT_PLAN_PREFIX);
}

function aiCreditPlanKey(packageId) {
    return `${AI_CREDIT_PLAN_PREFIX}${String(packageId || '').trim().toLowerCase()}`;
}

function parseAiCreditPackageId(planKey) {
    if (!isAiCreditPlanKey(planKey)) return null;
    const packageId = String(planKey).slice(AI_CREDIT_PLAN_PREFIX.length).trim().toLowerCase();
    return assertValidCreditPackageId(packageId) ? packageId : null;
}

function resolvePaymentProductLabel(planKey) {
    const creditId = parseAiCreditPackageId(planKey);
    if (creditId) {
        const pack = getPublicCreditPackage(creditId);
        return pack?.name ? `AllModelAI ${pack.name} Credits` : `AllModelAI ${creditId} credits`;
    }
    const plan = subscriptionPlans[normalizePlanKey(planKey)];
    return plan?.name ? `AllModelAI ${plan.name}` : 'AllModelAI subscription';
}

module.exports = {
    AI_CREDIT_PLAN_PREFIX,
    aiCreditPlanKey,
    isAiCreditPlanKey,
    parseAiCreditPackageId,
    resolvePaymentProductLabel,
};
