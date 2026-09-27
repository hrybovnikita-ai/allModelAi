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
const getCreditStatusCore = (database, email) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    expireSubscriptionIfNeeded(database, normalizedEmail);
    const data = database.read();
    data.subscriptions ||= {};
    data.usage ||= {};
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
    const used = Number(data.usage[normalizedEmail] || 0);
    const remaining = Math.max(limit - used, 0);
    const billingInterval = detail?.billingInterval || planDefinition.interval;
    const subscriptionView = buildSubscriptionPublicView(detail, plan, limit, used, remaining, billingInterval, {
        isDeveloper,
        hasPaidSubscription: hasSubscription,
    });

    return {
        data,
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
        ...subscriptionView,
    };
};

const getSubscriptionSummary = (req, res) => {
    const status = getCreditStatusCore(req.app.locals.db, req.user.email);
    const { data, email, enforced, ...access } = status;
    const checkoutFlags = buildCheckoutInfo();
    return res.json({
        ...checkoutFlags,
        ...access,
        currentPlan: access.currentPlan || access.planDisplayName,
        planKey: access.planKey || access.planSlug,
        manageTestSubscription: wayforpayTestModeEnabled() && access.hasSubscription && access.paymentProvider === 'wayforpay',
    });
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
    const { data, email, enforced, ...access } = status;
    return res.json({
        ...access,
        message: 'Test subscription ended. Your account is on the Free plan.',
    });
};

module.exports = {
    getCreditStatusCore,
    getSubscriptionSummary,
    cancelTestSubscriptionHandler,
};
