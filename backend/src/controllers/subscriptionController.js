const { wayforpayTestModeEnabled } = require('../wayforpay/config');
const { buildCheckoutInfo } = require('../payments/checkoutInfo');
const { subscriptionPlans } = require('../billing/plans');
const {
    cancelTestSubscription,
    expireSubscriptionIfNeeded,
    readSubscriptionDetail,
    buildSubscriptionPublicView,
    repairLegacyPlanRow,
    resolveStoredPlanKey,
} = require('../billing/subscriptionLifecycle');

function readUsageCount(database, normalizedEmail) {
    const row = database.database.prepare('SELECT used FROM usage WHERE email = ?').get(normalizedEmail);
    return Number(row?.used ?? 0);
}

const getCreditStatusCore = (database, email) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    expireSubscriptionIfNeeded(database, normalizedEmail);
    let detail = readSubscriptionDetail(database, normalizedEmail);
    if (detail) {
        detail = repairLegacyPlanRow(database.database, normalizedEmail, detail);
    }
    const detailActive = detail && detail.status === 'active' && (!detail.periodEnd || Date.parse(detail.periodEnd) > Date.now());
    const storedPlanKey = detail ? resolveStoredPlanKey(detail.plan) : 'free';
    const plan = detailActive ? storedPlanKey : 'free';
    const developerEmails = () => new Set(
        String(process.env.DEVELOPER_EMAILS || 'hrybovnikita@gmail.com')
            .split(',')
            .map((item) => item.trim().toLowerCase())
            .filter(Boolean),
    );
    const creditLimits = Object.fromEntries(Object.entries(subscriptionPlans).map(([key, p]) => [key, p.limit]));
    const creditLimitsEnabled = () => process.env.ENFORCE_CREDIT_LIMITS === 'true';
    const isDeveloper = developerEmails().has(normalizedEmail);
    const hasSubscription = Boolean(detailActive && subscriptionPlans[plan]?.amount > 0);
    const canUseDeveloper = isDeveloper || hasSubscription;
    const savedMode = database.database.prepare('SELECT mode FROM account_access_modes WHERE email = ?').get(normalizedEmail)?.mode;
    const mode = canUseDeveloper && savedMode !== 'user' ? 'developer' : 'user';
    const fullAccess = mode === 'developer' && canUseDeveloper;
    const planDefinition = subscriptionPlans[plan] || subscriptionPlans.free;
    const limit = detailActive ? detail.requestLimit : (creditLimits[plan] || creditLimits.free);
    const used = readUsageCount(database, normalizedEmail);
    const remaining = Math.max(limit - used, 0);
    const billingInterval = detail?.billingInterval || planDefinition.interval;
    const subscriptionView = buildSubscriptionPublicView(detail, plan, limit, used, remaining, billingInterval, {
        isDeveloper,
        hasPaidSubscription: hasSubscription,
    });

    return {
        email: normalizedEmail,
        plan,
        limit,
        used,
        remaining,
        billingInterval,
        periodEnd: detailActive ? detail.periodEnd : null,
        models: fullAccess ? ['all'] : subscriptionPlans.free.models,
        enforced: !fullAccess && creditLimitsEnabled(),
        isDeveloper,
        hasSubscription,
        canUseDeveloper,
        mode,
        unlimited: fullAccess,
        active: Boolean(detailActive && hasSubscription),
        ...subscriptionView,
    };
};

const getSubscriptionSummary = (req, res) => {
    try {
        const status = getCreditStatusCore(req.app.locals.db, req.user.email);
        const checkoutFlags = buildCheckoutInfo();
        return res.json({
            ...checkoutFlags,
            ...status,
            currentPlan: status.currentPlan || status.planDisplayName,
            planKey: status.planKey || status.planSlug,
            manageTestSubscription: wayforpayTestModeEnabled() && status.hasSubscription && status.paymentProvider === 'wayforpay',
        });
    } catch (error) {
        if (process.env.NODE_ENV !== 'test') {
            console.log('[SUBSCRIPTION] STATUS_FAILED', { reason: 'SUBSCRIPTION_READ_ERROR' });
        }
        return res.status(500).json({
            code: 'SUBSCRIPTION_UNAVAILABLE',
            message: 'Could not load subscription status. Please try again.',
        });
    }
};

const cancelTestSubscriptionHandler = (req, res) => {
    if (!wayforpayTestModeEnabled()) {
        return res.status(403).json({ message: 'Test subscription cancel is only available in WAYFORPAY_TEST_MODE.' });
    }
    const result = cancelTestSubscription(req.app.locals.db, req.user.email);
    if (!result.ok) {
        return res.status(result.status).json({ message: result.message });
    }
    const status = getCreditStatusCore(req.app.locals.db, req.user.email);
    return res.json({
        ...status,
        message: 'Test subscription ended. Your account is on the Free plan.',
    });
};

module.exports = {
    getCreditStatusCore,
    getSubscriptionSummary,
    cancelTestSubscriptionHandler,
};
