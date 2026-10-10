const { subscriptionPlans } = require('./plans');
const {
    buildSubscriptionPublicView,
    resolveStoredPlanKey,
    canonicalPlanSlug,
} = require('./subscriptionLifecycle');
const { queryPgPool, resolvePostgresAsyncPool } = require('../db/pgPoolQuery');
const { applyOwnerAccess } = require('./accessControl');
const { applyPlusTestCreditStatus, isAllowlistedDeveloper } = require('./plusTestMode');
const { readUserRoleAsync } = require('./userRole');

function mapSubscriptionDetailRow(row) {
    if (!row) return null;
    return {
        email: row.email,
        plan: row.plan,
        billingInterval: row.billingInterval ?? row.billinginterval,
        requestLimit: row.requestLimit ?? row.requestlimit,
        periodEnd: row.periodEnd ?? row.periodend,
        status: row.status,
        paymentProvider: row.paymentProvider ?? row.paymentprovider,
        orderReference: row.orderReference ?? row.orderreference,
        paymentStatus: row.paymentStatus ?? row.paymentstatus,
        amount: row.amount,
        currency: row.currency,
        activatedAt: row.activatedAt ?? row.activatedat,
        stripeSubscriptionId: row.stripeSubscriptionId ?? row.stripesubscriptionid,
        updatedAt: row.updatedAt ?? row.updatedat,
    };
}

async function readSubscriptionDetailAsync(connection, email) {
    const pool = resolvePostgresAsyncPool(connection);
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const result = await queryPgPool(
        pool,
        `SELECT
            email,
            plan,
            billing_interval AS "billingInterval",
            request_limit AS "requestLimit",
            period_end AS "periodEnd",
            status,
            payment_provider AS "paymentProvider",
            order_reference AS "orderReference",
            payment_status AS "paymentStatus",
            amount,
            currency,
            activated_at AS "activatedAt",
            stripe_subscription_id AS "stripeSubscriptionId",
            updated_at AS "updatedAt"
        FROM subscription_details
        WHERE email = $1`,
        [normalizedEmail],
    );
    return mapSubscriptionDetailRow(result.rows[0]);
}

async function readUsageCountAsync(connection, normalizedEmail) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        'SELECT used FROM usage WHERE email = $1',
        [normalizedEmail],
    );
    return Number(result.rows[0]?.used ?? 0);
}

async function readAccessModeAsync(connection, normalizedEmail) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        'SELECT mode FROM account_access_modes WHERE email = $1',
        [normalizedEmail],
    );
    return result.rows[0]?.mode;
}

async function repairLegacyPlanRowAsync(connection, email, detail) {
    if (!detail?.plan) return detail;
    const stored = canonicalPlanSlug(detail.plan, detail.requestLimit);
    if (stored === String(detail.plan).toLowerCase()) return detail;
    const pool = resolvePostgresAsyncPool(connection);
    const now = new Date().toISOString();
    await queryPgPool(
        pool,
        'UPDATE subscription_details SET plan = $1, updated_at = $2 WHERE email = $3',
        [stored, now, email],
    );
    return { ...detail, plan: stored };
}

async function expireSubscriptionIfNeededAsync(connection, email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const detail = await readSubscriptionDetailAsync(connection, normalizedEmail);
    if (!detail || detail.status !== 'active' || detail.plan === 'free') return false;
    if (!detail.periodEnd || Number.isNaN(Date.parse(detail.periodEnd))) return false;
    if (Date.parse(detail.periodEnd) > Date.now()) return false;

    const pool = resolvePostgresAsyncPool(connection);
    const free = subscriptionPlans.free;
    const now = new Date().toISOString();
    await queryPgPool(
        pool,
        `UPDATE subscription_details SET
            plan = $1,
            billing_interval = $2,
            request_limit = $3,
            period_end = NULL,
            status = $4,
            payment_status = COALESCE($5, payment_status),
            updated_at = $6
        WHERE email = $7`,
        ['free', free.interval, free.limit, 'expired', 'expired', now, normalizedEmail],
    );
    await queryPgPool(
        pool,
        `INSERT INTO subscriptions (email, plan) VALUES ($1, 'free')
         ON CONFLICT (email) DO UPDATE SET plan = EXCLUDED.plan`,
        [normalizedEmail],
    );
    return true;
}

async function buildCreditStatusPostgres(connection, email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    await expireSubscriptionIfNeededAsync(connection, normalizedEmail);
    let detail = await readSubscriptionDetailAsync(connection, normalizedEmail);
    if (detail) {
        detail = await repairLegacyPlanRowAsync(connection, normalizedEmail, detail);
    }
    const detailActive = detail && detail.status === 'active'
        && (!detail.periodEnd || Date.parse(detail.periodEnd) > Date.now());
    const storedPlanKey = detail ? resolveStoredPlanKey(detail.plan) : 'free';
    const plan = detailActive ? storedPlanKey : 'free';
    const creditLimits = Object.fromEntries(Object.entries(subscriptionPlans).map(([key, p]) => [key, p.limit]));
    const creditLimitsEnabled = () => process.env.ENFORCE_CREDIT_LIMITS === 'true';
    const hasSubscription = Boolean(detailActive && subscriptionPlans[plan]?.amount > 0);
    const savedMode = await readAccessModeAsync(connection, normalizedEmail);
    const planDefinition = subscriptionPlans[plan] || subscriptionPlans.free;
    const limit = detailActive ? detail.requestLimit : (creditLimits[plan] || creditLimits.free);
    const used = await readUsageCountAsync(connection, normalizedEmail);
    const remaining = Math.max(limit - used, 0);
    const billingInterval = detail?.billingInterval || planDefinition.interval;
    const subscriptionView = buildSubscriptionPublicView(detail, plan, limit, used, remaining, billingInterval, {
        isDeveloper: isAllowlistedDeveloper(normalizedEmail),
        hasPaidSubscription: hasSubscription,
    });

    const base = applyPlusTestCreditStatus({
        email: normalizedEmail,
        plan,
        limit,
        used,
        remaining,
        billingInterval,
        periodEnd: detailActive ? detail.periodEnd : null,
        models: subscriptionPlans[plan]?.models || subscriptionPlans.free.models,
        enforced: creditLimitsEnabled(),
        hasSubscription,
        savedMode,
        active: Boolean(detailActive && hasSubscription),
        ...subscriptionView,
    });
    const role = await readUserRoleAsync(connection, normalizedEmail);
    return applyOwnerAccess(base, role);
}

async function getCreditStatusCoreAsync(connection, email) {
    const engine = connection?.engine || 'sqlite';
    if (engine !== 'postgres') {
        const { getCreditStatusCore } = require('../controllers/subscriptionController');
        return getCreditStatusCore(connection, email);
    }
    return buildCreditStatusPostgres(connection, email);
}

module.exports = {
    getCreditStatusCoreAsync,
    readSubscriptionDetailAsync,
    expireSubscriptionIfNeededAsync,
};
