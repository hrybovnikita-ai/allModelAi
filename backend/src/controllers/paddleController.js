const { normalizePlanKey, subscriptionPlans } = require('../billing/plans');
const { getCreditStatusAsync } = require('../billing/creditStatusAsync');
const { publicAppOrigin } = require('../publicAccess');
const {
    assertPaddleCheckoutAllowed,
    resolvePaddlePriceId,
    isPaddleSandbox,
    clientTokenFromEnv,
    paddleConfigurationReport,
} = require('../payments/paddleConfig');
const { wasPaddleEventProcessed, markPaddleEventProcessed } = require('../payments/paddleWebhookIdempotency');
const { processPaddleWebhookEvent } = require('../payments/paddleWebhookEvents');

const frontendOrigin = (req) => publicAppOrigin(req);

const createPaddleCheckout = async (req, res) => {
    const guard = assertPaddleCheckoutAllowed();
    if (!guard.ok) {
        return res.status(503).json({
            code: guard.code,
            message: guard.message,
            userMessage: guard.message,
            missingEnvVars: guard.report?.missing || [],
            setupInstructions: guard.report?.setupInstructions,
        });
    }
    const planKey = normalizePlanKey(req.body.plan);
    const plan = subscriptionPlans[planKey];
    if (!plan || !plan.amount) {
        return res.status(400).json({
            message: 'Choose a valid paid subscription plan.',
            userMessage: 'Please select Starter, Pro, or Unlimited.',
        });
    }
    if (String(req.body.priceId || '').trim()) {
        return res.status(400).json({
            code: 'CLIENT_PRICE_FORBIDDEN',
            message: 'Price IDs are chosen on the server.',
        });
    }
    const email = String(req.user.email).trim().toLowerCase();
    const access = await getCreditStatusAsync(req.app.locals.db, email);
    if (access.hasSubscription && access.active && normalizePlanKey(access.plan) === planKey) {
        return res.status(409).json({
            code: 'SUBSCRIPTION_ALREADY_ACTIVE',
            message: 'You already have an active subscription on this plan.',
            userMessage: 'You are already subscribed to this plan.',
        });
    }
    const priceId = resolvePaddlePriceId(planKey);
    if (!priceId) {
        return res.status(503).json({
            code: 'PADDLE_PRICE_MISSING',
            message: `No Paddle price configured for plan ${planKey}.`,
            userMessage: 'Paddle checkout is not available for this plan yet.',
        });
    }
    const paddle = require('../payments/paddleClient').getPaddleClient();
    if (!paddle) {
        return res.status(503).json({ message: 'Paddle client is not configured.' });
    }
    try {
        const successUrl = `${frontendOrigin(req)}/checkout/success?plan=${encodeURIComponent(
            planKey === 'common' ? 'pro' : planKey === 'plus' ? 'enterprise' : planKey,
        )}&provider=paddle`;
        const transaction = await paddle.transactions.create({
            items: [{ priceId, quantity: 1 }],
            customer: { email },
            customData: {
                email,
                planKey,
                userName: req.user.name || 'Subscriber',
            },
            checkout: {
                url: successUrl,
            },
        });
        const transactionId = transaction?.id;
        if (!transactionId) {
            throw new Error('Paddle did not return a transaction id.');
        }
        return res.status(201).json({
            transactionId,
            paddleClientToken: clientTokenFromEnv(),
            paddleSandbox: isPaddleSandbox(),
            successUrl,
        });
    } catch (error) {
        return res.status(502).json({
            code: 'PADDLE_CHECKOUT_FAILED',
            message: error.message || 'Could not start Paddle checkout.',
            userMessage: 'Paddle checkout is temporarily unavailable. Try again or use another payment method.',
        });
    }
};

async function unmarshalPaddleWebhook(rawBody, signature) {
    const secret = String(process.env.PADDLE_WEBHOOK_SECRET || '').trim();
    const paddle = require('../payments/paddleClient').getPaddleClient();
    if (!paddle || !secret) {
        throw new Error('Paddle webhook is not configured.');
    }
    return paddle.webhooks.unmarshal(rawBody, secret, signature);
}

const paddleWebhook = async (req, res) => {
    const guard = assertPaddleCheckoutAllowed();
    if (!guard.ok && !String(process.env.PADDLE_WEBHOOK_SECRET || '').trim()) {
        return res.status(503).send('Paddle webhook is not configured');
    }
    const signature = String(req.get('paddle-signature') || req.headers['paddle-signature'] || '').trim();
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
    if (!signature || !rawBody) {
        return res.status(400).send('Missing Paddle signature or body');
    }
    let event;
    try {
        event = await unmarshalPaddleWebhook(rawBody, signature);
    } catch (error) {
        return res.status(401).send(`Webhook Error: ${error.message}`);
    }
    const eventId = event?.eventId || event?.notificationId || event?.id;
    const connection = req.app.locals.db;
    if (await wasPaddleEventProcessed(connection, eventId)) {
        return res.json({ received: true, duplicate: true });
    }
    try {
        await processPaddleWebhookEvent(connection, event);
        await markPaddleEventProcessed(connection, eventId, event?.eventType);
    } catch (error) {
        return res.status(500).json({ message: error.message || 'Webhook handler failed' });
    }
    return res.json({ received: true });
};

const getPaddlePublicConfig = (_req, res) => {
    const report = paddleConfigurationReport();
    return res.json({
        paddleConfigured: report.ok,
        paddleSandbox: report.sandbox,
        paddleClientToken: report.ok ? clientTokenFromEnv() : null,
        paddleSetupInstructions: report.setupInstructions,
        paddleMissingEnvVars: report.missing,
    });
};

module.exports = {
    createPaddleCheckout,
    paddleWebhook,
    getPaddlePublicConfig,
    unmarshalPaddleWebhook,
};
