const { subscriptionPlans, periodEndFor, normalizePlanKey, planSlugForKey, planDisplayName } = require('./plans');
const {
    getTableColumnNames,
    isPostgresDatabaseMode,
} = require('../db/schemaIntrospection');

const PLAN_LABELS = {
    free: 'Free',
    week: 'Weekly',
    common: 'Pro Monthly',
    plus: 'Power Monthly',
};

const resolveStoredPlanKey = (rawPlan) => {
    const key = normalizePlanKey(rawPlan);
    return subscriptionPlans[key] ? key : 'free';
};

/** Canonical slug stored in subscription_details.plan (free, pro, week, power). */
const canonicalPlanSlug = (rawPlan, requestLimit = null) => {
    const { planStorageValue } = require('./plans');
    const raw = String(rawPlan || '').toLowerCase();
    const internal = resolveStoredPlanKey(raw);
    const slug = planStorageValue(internal);
    if (slug === 'pro' || slug === 'power' || slug === 'week' || slug === 'free') return slug;
    if (Number(requestLimit) === 3000) return 'pro';
    if (Number(requestLimit) === 12000) return 'power';
    if (Number(requestLimit) === 500) return 'week';
    return slug;
};

const repairLegacyPlanRow = (database, email, detail) => {
    if (!detail?.plan) return detail;
    const stored = canonicalPlanSlug(detail.plan, detail.requestLimit);
    if (stored === String(detail.plan).toLowerCase()) return detail;
    const now = new Date().toISOString();
    database.prepare('UPDATE subscription_details SET plan = ?, updated_at = ? WHERE email = ?').run(stored, now, email);
    return { ...detail, plan: stored };
};

const migrateAllSubscriptionPlanSlugs = (appDb) => {
    ensureSubscriptionBillingSchema(appDb.database);
    const rows = appDb.database.prepare(`
        SELECT email, plan, request_limit AS requestLimit
        FROM subscription_details
    `).all();
    let updated = 0;
    const now = new Date().toISOString();
    for (const row of rows) {
        const canonical = canonicalPlanSlug(row.plan, row.requestLimit);
        if (canonical === String(row.plan).toLowerCase()) continue;
        appDb.database.prepare('UPDATE subscription_details SET plan = ?, updated_at = ? WHERE email = ?')
            .run(canonical, now, row.email);
        updated += 1;
    }
    if (updated > 0) {
        const data = appDb.read();
        data.subscriptions ||= {};
        for (const row of rows) {
            const canonical = canonicalPlanSlug(row.plan, row.requestLimit);
            const email = String(row.email).toLowerCase();
            if (data.subscriptions[email] && canonical !== 'free') {
                data.subscriptions[email] = resolveStoredPlanKey(canonical);
            }
        }
        appDb.write(data);
    }
    return updated;
};

const ensureSubscriptionBillingSchema = (database) => {
    if (isPostgresDatabaseMode()) {
        return;
    }
    const columns = getTableColumnNames(database, 'subscription_details');
    const addColumn = (name, ddl) => {
        if (!columns.includes(name)) {
            database.exec(`ALTER TABLE subscription_details ADD COLUMN ${ddl}`);
        }
    };
    addColumn('payment_provider', 'payment_provider TEXT');
    addColumn('order_reference', 'order_reference TEXT');
    addColumn('payment_status', 'payment_status TEXT');
    addColumn('amount', 'amount REAL');
    addColumn('currency', 'currency TEXT');
    addColumn('activated_at', 'activated_at TEXT');
};

const revertToFreePlan = (database, email, { status = 'expired', paymentStatus = null } = {}) => {
    ensureSubscriptionBillingSchema(database.database);
    const normalizedEmail = String(email).trim().toLowerCase();
    const free = subscriptionPlans.free;
    const now = new Date().toISOString();
    database.database.prepare(`
        UPDATE subscription_details SET
            plan = ?,
            billing_interval = ?,
            request_limit = ?,
            period_end = NULL,
            status = ?,
            payment_status = COALESCE(?, payment_status),
            updated_at = ?
        WHERE email = ?
    `).run('free', free.interval, free.limit, status, paymentStatus, now, normalizedEmail);

    const data = database.read();
    data.subscriptions ||= {};
    data.subscriptions[normalizedEmail] = 'free';
    database.write(data);
};

const expireSubscriptionIfNeeded = (database, email) => {
    ensureSubscriptionBillingSchema(database.database);
    const normalizedEmail = String(email).trim().toLowerCase();
    const detail = database.database.prepare(`
        SELECT plan, period_end AS periodEnd, status
        FROM subscription_details WHERE email = ?
    `).get(normalizedEmail);
    if (!detail || detail.status !== 'active' || detail.plan === 'free') return false;
    if (!detail.periodEnd || Number.isNaN(Date.parse(detail.periodEnd))) return false;
    if (Date.parse(detail.periodEnd) > Date.now()) return false;
    revertToFreePlan(database, normalizedEmail, { status: 'expired', paymentStatus: 'expired' });
    return true;
};

const cancelTestSubscription = (database, email) => {
    ensureSubscriptionBillingSchema(database.database);
    const normalizedEmail = String(email).trim().toLowerCase();
    const detail = database.database.prepare(`
        SELECT plan, status, payment_provider AS paymentProvider, stripe_subscription_id AS stripeSubscriptionId
        FROM subscription_details WHERE email = ?
    `).get(normalizedEmail);
    if (!detail || detail.status !== 'active' || detail.plan === 'free') {
        return { ok: false, status: 404, message: 'No active paid subscription to cancel.' };
    }
    const isWayforpayTest = detail.paymentProvider === 'wayforpay'
        && String(detail.stripeSubscriptionId || '').startsWith('wayforpay_');
    if (!isWayforpayTest && detail.paymentProvider !== 'wayforpay') {
        return { ok: false, status: 403, message: 'Only WayForPay test subscriptions can be canceled here.' };
    }
    revertToFreePlan(database, normalizedEmail, { status: 'canceled', paymentStatus: 'canceled' });
    database.database.prepare(`
        UPDATE wayforpay_payments SET status = 'canceled', updated_at = ?
        WHERE user_email = ? AND status = 'paid'
    `).run(new Date().toISOString(), normalizedEmail);
    return { ok: true, plan: 'free' };
};

const readSubscriptionDetail = (database, email) => {
    ensureSubscriptionBillingSchema(database.database);
    return database.database.prepare(`
        SELECT
            email,
            plan,
            billing_interval AS billingInterval,
            request_limit AS requestLimit,
            period_end AS periodEnd,
            status,
            payment_provider AS paymentProvider,
            order_reference AS orderReference,
            payment_status AS paymentStatus,
            amount,
            currency,
            activated_at AS activatedAt,
            stripe_subscription_id AS stripeSubscriptionId,
            updated_at AS updatedAt
        FROM subscription_details
        WHERE email = ?
    `).get(String(email).trim().toLowerCase());
};

const subscriptionStatusLabel = (detail, planKey, { isDeveloper = false } = {}) => {
    if (!detail) return isDeveloper ? 'active' : 'none';
    if (detail.status === 'canceled') return 'canceled';
    if (detail.status === 'expired') return 'expired';
    if (detail.status === 'active') {
        if (planKey !== 'free') return 'active';
        if (detail.paymentProvider && detail.paymentStatus === 'successful') return 'active';
        if (isDeveloper) return 'active';
        return 'free';
    }
    return detail.status || 'unknown';
};

const formatPeriodEnd = (iso) => {
    if (!iso) return null;
    try {
        return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
        return iso;
    }
};

const buildSubscriptionPublicView = (detail, planKey, limit, used, remaining, billingInterval, context = {}) => {
    const hasPaidSubscription = Boolean(context.hasPaidSubscription);
    const isDeveloper = Boolean(context.isDeveloper);
    const storedPlanKey = detail?.plan
        ? canonicalPlanSlug(detail.plan, detail.requestLimit ?? limit)
        : planSlugForKey(planKey);
    const displayName = planDisplayName(planKey, { isDeveloper, hasPaidSubscription, storedPlanKey });
    const status = subscriptionStatusLabel(detail, planKey, { isDeveloper });
    return {
    planKey: storedPlanKey,
    plan: planKey,
    planSlug: storedPlanKey,
    planDisplayName: displayName,
    currentPlan: displayName,
    limit,
    used,
    remaining,
    requestsRemaining: remaining,
    billingInterval,
    subscriptionStatus: status,
    paymentProvider: detail?.paymentProvider || null,
    orderReference: detail?.orderReference || null,
    paymentStatus: detail?.paymentStatus || null,
    amount: detail?.amount ?? null,
    currency: detail?.currency ?? null,
    activatedAt: detail?.activatedAt || null,
    expiresAt: detail?.periodEnd || null,
    expiresAtLabel: formatPeriodEnd(detail?.periodEnd),
    renewalLabel: detail?.periodEnd ? `Renews/Expires: ${formatPeriodEnd(detail.periodEnd)}` : null,
};
};

module.exports = {
    PLAN_LABELS,
    ensureSubscriptionBillingSchema,
    revertToFreePlan,
    expireSubscriptionIfNeeded,
    cancelTestSubscription,
    readSubscriptionDetail,
    buildSubscriptionPublicView,
    resolveStoredPlanKey,
    repairLegacyPlanRow,
    migrateAllSubscriptionPlanSlugs,
    canonicalPlanSlug,
    periodEndFor,
};
