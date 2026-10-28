const { lemonSqueezySetup, createCheckout } = require('@lemonsqueezy/lemonsqueezy.js');
const { subscriptionPlans } = require('../billing/plans');
const { activateSubscription } = require('../billing/subscriptions');
const { activateSubscriptionAsync } = require('../billing/subscriptionsAsync');
const { isPostgresConnection } = require('../db/postgresHttpReads');
const { logSubscription } = require('../billing/paymentLogger');
const {
    assertLemonSqueezyCheckoutAllowed,
    isAllowedVariantId,
    lemonSqueezyConfigurationReport,
    resolveClientUrl,
    resolveDefaultVariantId,
    resolveLemonSqueezyPlanKey,
} = require('../payments/lemonSqueezyConfig');
const { verifyLemonSqueezyWebhookSignature } = require('../payments/lemonSqueezyWebhookVerify');
const { claimLemonSqueezyEvent } = require('../payments/lemonSqueezyWebhookIdempotency');

const FULFILLMENT_EVENTS = new Set(['order_created', 'subscription_created']);

function parseCheckoutUrl(checkoutResponse) {
    return checkoutResponse?.data?.attributes?.url
        || checkoutResponse?.data?.data?.attributes?.url
        || null;
}

async function lookupUserForFulfillment(connection, { userId, emailHint }) {
    const id = Number(userId);
    if (Number.isFinite(id) && id > 0) {
        if (isPostgresConnection(connection)) {
            const { queryPgPool, resolvePostgresAsyncPool } = require('../db/pgPoolQuery');
            const pool = resolvePostgresAsyncPool(connection);
            const result = await queryPgPool(
                pool,
                'SELECT id, name, email FROM users WHERE id = $1',
                [id],
            );
            if (result.rows[0]) return result.rows[0];
        } else {
            const row = connection.database.prepare(
                'SELECT id, name, email FROM users WHERE id = ?',
            ).get(id);
            if (row) return row;
        }
    }
    const email = String(emailHint || '').trim().toLowerCase();
    if (!email) return null;
    if (isPostgresConnection(connection)) {
        const { queryPgPool, resolvePostgresAsyncPool } = require('../db/pgPoolQuery');
        const pool = resolvePostgresAsyncPool(connection);
        const result = await queryPgPool(
            pool,
            'SELECT id, name, email FROM users WHERE lower(trim(email)) = $1',
            [email],
        );
        return result.rows[0] || null;
    }
    return connection.database.prepare(
        'SELECT id, name, email FROM users WHERE lower(trim(email)) = ?',
    ).get(email) || null;
}

async function fulfillLemonSqueezyPurchase(connection, {
    user,
    planKey,
    orderReference,
    subscriptionId,
    amountCents,
    currency,
    testMode,
}) {
    const plan = subscriptionPlans[planKey];
    if (!plan) throw new Error(`Unknown plan key: ${planKey}`);
    const payload = {
        email: user.email,
        name: user.name || 'Subscriber',
        planKey,
        stripeCustomerId: null,
        stripeSubscriptionId: subscriptionId ? String(subscriptionId) : null,
        paymentProvider: 'lemonsqueezy',
        orderReference: orderReference ? String(orderReference) : null,
        paymentStatus: 'successful',
        amount: amountCents != null ? Number(amountCents) : plan.amount,
        currency: currency || 'USD',
        isTestPayment: Boolean(testMode),
    };
    if (isPostgresConnection(connection)) {
        await activateSubscriptionAsync(connection, payload);
    } else {
        activateSubscription(connection, payload);
    }
    logSubscription('Lemon Squeezy subscription fulfilled', {
        email: user.email,
        userId: user.id,
        plan: planKey,
        orderReference: payload.orderReference,
        test: testMode,
    });
}

async function handleLemonSqueezyWebhookPayload(connection, event) {
    const eventName = String(event?.meta?.event_name || '').trim();
    if (!FULFILLMENT_EVENTS.has(eventName)) {
        return { handled: false, reason: 'ignored_event' };
    }
    const custom = event?.meta?.custom_data || event?.meta?.custom || {};
    const userId = custom.user_id ?? custom.userId;
    const emailHint = custom.email || event?.data?.attributes?.user_email;
    const user = await lookupUserForFulfillment(connection, { userId, emailHint });
    if (!user?.email) {
        throw new Error('Could not resolve user for Lemon Squeezy fulfillment');
    }
    const planKey = resolveLemonSqueezyPlanKey();
    const attrs = event?.data?.attributes || {};
    const orderReference = event?.data?.id || attrs.identifier || attrs.order_number;
    const subscriptionId = attrs.subscription_id || attrs.first_subscription_item?.subscription_id || null;
    const amountCents = attrs.total ?? attrs.subtotal ?? attrs.total_usd ?? null;
    const currency = String(attrs.currency || 'USD').toUpperCase();
    const testMode = Boolean(event?.meta?.test_mode);
    await fulfillLemonSqueezyPurchase(connection, {
        user,
        planKey,
        orderReference,
        subscriptionId,
        amountCents,
        currency,
        testMode,
    });
    return { handled: true, eventName, email: user.email };
}

const createLemonSqueezyCheckout = async (req, res) => {
    const guard = assertLemonSqueezyCheckoutAllowed();
    if (!guard.ok) {
        return res.status(503).json({ code: guard.code, message: guard.message });
    }
    const sessionUserId = Number(req.user?.id);
    if (!Number.isFinite(sessionUserId) || sessionUserId <= 0) {
        return res.status(401).json({ message: 'Sign in to start checkout.' });
    }
    const bodyUserId = req.body?.userId != null ? Number(req.body.userId) : sessionUserId;
    if (bodyUserId !== sessionUserId) {
        return res.status(403).json({
            code: 'CHECKOUT_USER_MISMATCH',
            message: 'Checkout must use your signed-in account.',
        });
    }
    const variantId = String(req.body?.variantId || resolveDefaultVariantId()).trim();
    if (!isAllowedVariantId(variantId)) {
        return res.status(400).json({
            code: 'VARIANT_NOT_ALLOWED',
            message: 'This product variant is not enabled for checkout.',
        });
    }
    const storeId = String(process.env.LEMONSQUEEZY_STORE_ID || '').trim();
    lemonSqueezySetup({ apiKey: process.env.LEMONSQUEEZY_API_KEY.trim() });
    const redirectUrl = `${resolveClientUrl(req)}/dashboard?payment=success`;
    try {
        const checkout = await createCheckout(storeId, variantId, {
            checkoutData: {
                email: req.user.email,
                name: req.user.name || undefined,
                custom: {
                    user_id: String(sessionUserId),
                    email: String(req.user.email || '').trim().toLowerCase(),
                    plan: resolveLemonSqueezyPlanKey(),
                },
            },
            productOptions: {
                redirectUrl,
            },
            checkoutOptions: {
                embed: false,
            },
        });
        if (checkout.error) {
            console.error('[LEMONSQUEEZY] checkout_error', checkout.error.message);
            return res.status(502).json({
                code: 'LEMONSQUEEZY_CHECKOUT_FAILED',
                message: 'Could not create Lemon Squeezy checkout. Please try again.',
            });
        }
        const checkoutUrl = parseCheckoutUrl(checkout.data);
        if (!checkoutUrl) {
            return res.status(502).json({
                code: 'LEMONSQUEEZY_CHECKOUT_INVALID',
                message: 'Checkout response did not include a payment URL.',
            });
        }
        return res.status(200).json({ checkoutUrl });
    } catch (error) {
        console.error('[LEMONSQUEEZY] checkout_exception', error.message);
        return res.status(502).json({
            code: 'LEMONSQUEEZY_CHECKOUT_FAILED',
            message: 'Could not create Lemon Squeezy checkout. Please try again.',
        });
    }
};

const lemonSqueezyWebhook = async (req, res) => {
    const secret = String(process.env.LEMONSQUEEZY_WEBHOOK_SECRET || '').trim();
    if (!secret) {
        return res.status(503).send('Lemon Squeezy webhook secret is not configured');
    }
    const signature = req.get('X-Signature') || req.get('x-signature');
    if (!verifyLemonSqueezyWebhookSignature(req.body, signature, secret)) {
        return res.status(401).send('Invalid signature');
    }
    let event;
    try {
        const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
        event = JSON.parse(raw);
    } catch {
        return res.status(400).send('Invalid JSON');
    }
    const eventName = String(event?.meta?.event_name || 'unknown');
    const eventId = String(
        event?.meta?.webhook_id
        || event?.meta?.event_id
        || `${eventName}:${event?.data?.id || 'unknown'}`,
    );
    const connection = req.app.locals.db;
    try {
        const claimed = await claimLemonSqueezyEvent(connection, eventId, eventName);
        if (!claimed) {
            return res.status(200).send('OK');
        }
        await handleLemonSqueezyWebhookPayload(connection, event);
        return res.status(200).send('OK');
    } catch (error) {
        console.error('[LEMONSQUEEZY] webhook_handler_error', eventName, error.message);
        return res.status(500).send('Webhook handler failed');
    }
};

const getLemonSqueezyPublicConfig = (_req, res) => {
    const report = lemonSqueezyConfigurationReport();
    return res.json({
        provider: 'lemonsqueezy',
        checkoutEnabled: report.checkoutEnabled,
        variantId: report.variantId,
        priceLabel: report.priceLabel,
        planKey: report.planKey,
        webhookConfigured: report.webhookConfigured,
    });
};

module.exports = {
    createLemonSqueezyCheckout,
    lemonSqueezyWebhook,
    getLemonSqueezyPublicConfig,
    handleLemonSqueezyWebhookPayload,
    parseCheckoutUrl,
};
