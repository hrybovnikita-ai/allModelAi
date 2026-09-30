const { subscriptionPlans, periodEndFor, normalizePlanKey, planStorageValue } = require('./plans');
const { logSubscription } = require('./paymentLogger');
const { queryPgPool, resolvePostgresAsyncPool } = require('../db/pgPoolQuery');

async function activateSubscriptionAsync(connection, {
    email,
    name = 'Subscriber',
    city = '',
    dateOfBirth = '',
    planKey,
    stripeCustomerId = null,
    stripeSubscriptionId = null,
    paymentProvider = null,
    orderReference = null,
    paymentStatus = 'successful',
    amount = null,
    currency = null,
    isTestPayment = false,
}) {
    const normalizedPlanKey = normalizePlanKey(planKey);
    const plan = subscriptionPlans[normalizedPlanKey];
    if (!plan) throw new Error('Unknown subscription plan');
    const pool = resolvePostgresAsyncPool(connection);
    const normalizedEmail = String(email).trim().toLowerCase();
    const activatedAt = new Date().toISOString();
    const periodEnd = periodEndFor(plan.interval);
    const storedPlan = planStorageValue(normalizedPlanKey);

    const purchaseIdResult = await queryPgPool(
        pool,
        'SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM purchases',
    );
    const purchaseId = Number(purchaseIdResult.rows[0]?.next_id ?? 1);

    await queryPgPool(
        pool,
        `INSERT INTO purchases (id, name, email, city, date_of_birth, plan, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
            purchaseId,
            String(name).trim(),
            normalizedEmail,
            String(city).trim(),
            String(dateOfBirth),
            normalizedPlanKey,
            activatedAt,
        ],
    );

    await queryPgPool(
        pool,
        `INSERT INTO subscriptions (email, plan) VALUES ($1, $2)
         ON CONFLICT (email) DO UPDATE SET plan = EXCLUDED.plan`,
        [normalizedEmail, normalizedPlanKey],
    );

    await queryPgPool(
        pool,
        `INSERT INTO usage (email, used) VALUES ($1, 0)
         ON CONFLICT (email) DO UPDATE SET used = 0`,
        [normalizedEmail],
    );

    await queryPgPool(
        pool,
        `INSERT INTO subscription_details (
            email, plan, billing_interval, request_limit, period_end,
            stripe_customer_id, stripe_subscription_id, status, updated_at,
            payment_provider, order_reference, payment_status, amount, currency, activated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (email) DO UPDATE SET
            plan = EXCLUDED.plan,
            billing_interval = EXCLUDED.billing_interval,
            request_limit = EXCLUDED.request_limit,
            period_end = EXCLUDED.period_end,
            stripe_customer_id = EXCLUDED.stripe_customer_id,
            stripe_subscription_id = EXCLUDED.stripe_subscription_id,
            status = 'active',
            updated_at = EXCLUDED.updated_at,
            payment_provider = EXCLUDED.payment_provider,
            order_reference = EXCLUDED.order_reference,
            payment_status = EXCLUDED.payment_status,
            amount = EXCLUDED.amount,
            currency = EXCLUDED.currency,
            activated_at = EXCLUDED.activated_at`,
        [
            normalizedEmail,
            storedPlan,
            plan.interval,
            plan.limit,
            periodEnd,
            stripeCustomerId,
            stripeSubscriptionId,
            activatedAt,
            paymentProvider,
            orderReference,
            paymentStatus,
            amount,
            currency,
            activatedAt,
        ],
    );

    logSubscription(`${plan.name} activated`, {
        email: normalizedEmail,
        plan: normalizedPlanKey,
        orderReference,
        paymentProvider,
        test: isTestPayment,
        expiresAt: periodEnd,
    });

    return {
        id: purchaseId,
        plan: normalizedPlanKey,
        name: String(name).trim(),
        email: normalizedEmail,
        city: String(city).trim(),
        dateOfBirth: String(dateOfBirth),
        createdAt: activatedAt,
    };
}

async function revertToFreePlanAsync(connection, email, { status = 'expired', paymentStatus = null } = {}) {
    const pool = resolvePostgresAsyncPool(connection);
    const normalizedEmail = String(email).trim().toLowerCase();
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
        ['free', free.interval, free.limit, status, paymentStatus, now, normalizedEmail],
    );
    await queryPgPool(
        pool,
        `INSERT INTO subscriptions (email, plan) VALUES ($1, 'free')
         ON CONFLICT (email) DO UPDATE SET plan = EXCLUDED.plan`,
        [normalizedEmail],
    );
}

async function cancelTestSubscriptionAsync(connection, email) {
    const pool = resolvePostgresAsyncPool(connection);
    const normalizedEmail = String(email).trim().toLowerCase();
    const detailResult = await queryPgPool(
        pool,
        `SELECT plan, status,
                payment_provider AS "paymentProvider",
                stripe_subscription_id AS "stripeSubscriptionId"
         FROM subscription_details WHERE email = $1`,
        [normalizedEmail],
    );
    const detail = detailResult.rows[0];
    if (!detail || detail.status !== 'active' || detail.plan === 'free') {
        return { ok: false, status: 404, message: 'No active paid subscription to cancel.' };
    }
    const isWayforpayTest = detail.paymentProvider === 'wayforpay'
        && String(detail.stripeSubscriptionId || '').startsWith('wayforpay_');
    if (!isWayforpayTest && detail.paymentProvider !== 'wayforpay') {
        return { ok: false, status: 403, message: 'Only WayForPay test subscriptions can be canceled here.' };
    }
    await revertToFreePlanAsync(connection, normalizedEmail, { status: 'canceled', paymentStatus: 'canceled' });
    const now = new Date().toISOString();
    await queryPgPool(
        pool,
        `UPDATE wayforpay_payments SET status = 'canceled', updated_at = $1
         WHERE user_email = $2 AND status = 'paid'`,
        [now, normalizedEmail],
    );
    return { ok: true, plan: 'free' };
}

module.exports = {
    activateSubscriptionAsync,
    revertToFreePlanAsync,
    cancelTestSubscriptionAsync,
};
