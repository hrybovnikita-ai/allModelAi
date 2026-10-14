const { EventName } = require('@paddle/paddle-node-sdk');
const { normalizePlanKey } = require('../billing/plans');
const { activateSubscription } = require('../billing/subscriptions');
const { activateSubscriptionAsync } = require('../billing/subscriptionsAsync');
const { revertToFreePlan } = require('../billing/subscriptionLifecycle');
const { revertToFreePlanAsync } = require('../billing/subscriptionsAsync');
const { isPostgresConnection } = require('../db/postgresHttpReads');
const { isPaddleSandbox } = require('./paddleConfig');
const { logSubscription } = require('../billing/paymentLogger');

function readCustomData(payload) {
    const data = payload?.customData || payload?.custom_data || {};
    return {
        email: String(data.email || data.userEmail || '').trim().toLowerCase(),
        planKey: normalizePlanKey(data.planKey || data.plan),
        userName: String(data.userName || data.name || 'Subscriber').trim(),
    };
}

function subscriptionIsBillable(status) {
    const value = String(status || '').toLowerCase();
    return value === 'active' || value === 'trialing';
}

async function activateFromPaddle(connection, {
    email,
    planKey,
    userName,
    customerId,
    subscriptionId,
    transactionId,
    amount,
    currency,
}) {
    if (!email || !planKey) {
        throw new Error('Paddle webhook missing email or plan metadata.');
    }
    const payload = {
        email,
        name: userName || 'Subscriber',
        planKey,
        stripeCustomerId: customerId ? String(customerId) : null,
        stripeSubscriptionId: subscriptionId ? String(subscriptionId) : null,
        paymentProvider: 'paddle',
        orderReference: transactionId ? String(transactionId) : (subscriptionId ? String(subscriptionId) : null),
        paymentStatus: isPaddleSandbox() ? 'test_paid' : 'paid',
        amount: amount != null ? Number(amount) : null,
        currency: currency || 'usd',
        isTestPayment: isPaddleSandbox(),
    };
    if (isPostgresConnection(connection)) {
        await activateSubscriptionAsync(connection, payload);
    } else {
        activateSubscription(connection, payload);
    }
    logSubscription('Paddle subscription activated', { email, plan: planKey, subscriptionId, test: isPaddleSandbox() });
}

async function deactivateFromPaddle(connection, subscriptionId, { status = 'canceled', paymentStatus = 'canceled' } = {}) {
    const subId = String(subscriptionId || '').trim();
    if (!subId) return;
    const updatedAt = new Date().toISOString();
    if (isPostgresConnection(connection)) {
        const { queryPgPool, resolvePostgresAsyncPool } = require('../db/pgPoolQuery');
        const pool = resolvePostgresAsyncPool(connection);
        const row = await queryPgPool(
            pool,
            `SELECT email FROM subscription_details
             WHERE stripe_subscription_id = $1 AND payment_provider = 'paddle'`,
            [subId],
        );
        const email = row.rows[0]?.email;
        if (email) {
            await revertToFreePlanAsync(connection, email, { status, paymentStatus });
        } else {
            await queryPgPool(
                pool,
                `UPDATE subscription_details SET status = $1, payment_status = $2, updated_at = $3
                 WHERE stripe_subscription_id = $4 AND payment_provider = 'paddle'`,
                [status, paymentStatus, updatedAt, subId],
            );
        }
        return;
    }
    const row = connection.database.prepare(
        'SELECT email FROM subscription_details WHERE stripe_subscription_id = ? AND payment_provider = ?',
    ).get(subId, 'paddle');
    if (row?.email) {
        revertToFreePlan(connection, row.email, { status, paymentStatus });
    } else {
        connection.database.prepare(
            'UPDATE subscription_details SET status = ?, payment_status = ?, updated_at = ? WHERE stripe_subscription_id = ? AND payment_provider = ?',
        ).run(status, paymentStatus, updatedAt, subId, 'paddle');
    }
}

async function markPaddlePastDue(connection, subscriptionId) {
    const subId = String(subscriptionId || '').trim();
    if (!subId) return;
    const updatedAt = new Date().toISOString();
    if (isPostgresConnection(connection)) {
        const { queryPgPool, resolvePostgresAsyncPool } = require('../db/pgPoolQuery');
        const pool = resolvePostgresAsyncPool(connection);
        await queryPgPool(
            pool,
            `UPDATE subscription_details SET status = 'past_due', payment_status = 'failed', updated_at = $1
             WHERE stripe_subscription_id = $2 AND payment_provider = 'paddle'`,
            [updatedAt, subId],
        );
        return;
    }
    connection.database.prepare(
        'UPDATE subscription_details SET status = ?, payment_status = ?, updated_at = ? WHERE stripe_subscription_id = ? AND payment_provider = ?',
    ).run('past_due', 'failed', updatedAt, subId, 'paddle');
}

async function processPaddleWebhookEvent(connection, event) {
    const eventType = event?.eventType || event?.event_type;
    const data = event?.data || event?.payload?.data || event?.payload;
    if (!eventType || !data) return { handled: false };

    switch (eventType) {
        case EventName.SubscriptionActivated:
        case EventName.SubscriptionCreated: {
            const custom = readCustomData(data);
            const email = custom.email || String(data.customer?.email || '').trim().toLowerCase();
            const planKey = custom.planKey || normalizePlanKey(data.items?.[0]?.price?.customData?.planKey);
            if (!subscriptionIsBillable(data.status)) return { handled: true, skipped: true };
            await activateFromPaddle(connection, {
                email,
                planKey,
                userName: custom.userName,
                customerId: data.customerId || data.customer_id,
                subscriptionId: data.id,
                transactionId: data.transactionId || data.transaction_id,
                amount: data.items?.[0]?.price?.unitPrice?.amount,
                currency: data.currencyCode || data.currency_code || 'usd',
            });
            return { handled: true };
        }
        case EventName.SubscriptionUpdated: {
            const subId = data.id;
            if (subscriptionIsBillable(data.status)) {
                const custom = readCustomData(data);
                const email = custom.email || String(data.customer?.email || '').trim().toLowerCase();
                await activateFromPaddle(connection, {
                    email,
                    planKey: custom.planKey,
                    userName: custom.userName,
                    customerId: data.customerId || data.customer_id,
                    subscriptionId: subId,
                    transactionId: data.transactionId,
                });
            } else if (String(data.status).toLowerCase() === 'canceled') {
                await deactivateFromPaddle(connection, subId);
            } else if (String(data.status).toLowerCase() === 'past_due') {
                await markPaddlePastDue(connection, subId);
            }
            return { handled: true };
        }
        case EventName.SubscriptionCanceled:
        case EventName.SubscriptionPastDue: {
            const subId = data.id;
            if (eventType === EventName.SubscriptionPastDue) {
                await markPaddlePastDue(connection, subId);
            } else {
                await deactivateFromPaddle(connection, subId);
            }
            return { handled: true };
        }
        case EventName.TransactionCompleted: {
            const custom = readCustomData(data);
            const subscriptionId = data.subscriptionId || data.subscription_id;
            if (subscriptionId) {
                return { handled: true, skipped: true };
            }
            const email = custom.email || String(data.customer?.email || '').trim().toLowerCase();
            await activateFromPaddle(connection, {
                email,
                planKey: custom.planKey,
                userName: custom.userName,
                customerId: data.customerId || data.customer_id,
                subscriptionId: null,
                transactionId: data.id,
                amount: data.details?.totals?.total,
                currency: data.currencyCode || data.currency_code || 'usd',
            });
            return { handled: true };
        }
        case EventName.TransactionPaymentFailed: {
            const subscriptionId = data.subscriptionId || data.subscription_id;
            if (subscriptionId) await markPaddlePastDue(connection, subscriptionId);
            return { handled: true };
        }
        case EventName.AdjustmentCreated:
        case EventName.AdjustmentUpdated: {
            const action = String(data.action || '').toLowerCase();
            if (action.includes('refund')) {
                const subscriptionId = data.subscriptionId || data.subscription_id;
                if (subscriptionId) {
                    await deactivateFromPaddle(connection, subscriptionId, {
                        status: 'canceled',
                        paymentStatus: 'refunded',
                    });
                }
            }
            return { handled: true };
        }
        default:
            return { handled: false };
    }
}

module.exports = {
    processPaddleWebhookEvent,
    readCustomData,
};
