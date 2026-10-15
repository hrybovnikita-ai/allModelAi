const Stripe = require('stripe');
const {
    assertValidCreditPackageId,
    getPublicCreditPackage,
    getPublicCreditPackages,
    resolvePackConfig,
    stripePriceIdForCreditPack,
} = require('../billing/aiCreditPackages');
const { fulfillAiCreditPackPurchase } = require('../billing/aiCreditFulfillment');
const {
    listLedgerAsync,
    readWalletSummaryAsync,
    reverseCreditsIdempotentAsync,
    findLedgerByReferenceAsync,
} = require('../billing/aiCreditLedger');
const { assertCreemCheckoutAllowed, creemConfigurationReport } = require('../payments/creemConfig');
const { assertStripeCheckoutAllowed, isStripeTestMode, shouldPreferStripeOverWayforpay } = require('../payments/stripeMode');
const { stripeGuardUserMessage } = require('../payments/stripeUserMessages');
const { stripeCheckoutWalletOptions, ensureStripePaymentMethodDomain } = require('../stripeWallet');
const { stripeConfigurationReport, publishableKeyFromEnv } = require('../payments/stripeConfig');

function frontendOrigin(req) {
    const configured = String(process.env.FRONTEND_ORIGIN || process.env.CLIENT_URL || '').trim();
    if (configured) return configured.replace(/\/$/, '');
    const origin = req.get('origin');
    if (origin) return origin.replace(/\/$/, '');
    return 'http://localhost:5173';
}

const { stripeCheckoutEnabledForDeployment } = require('../payments/paymentProvider');

const getAiCreditPackages = (_req, res) => {
    const creem = creemConfigurationReport();
    const creemGuard = assertCreemCheckoutAllowed();
    const checkoutAvailable = Boolean(creemGuard.ok);
    return res.json({
        packages: getPublicCreditPackages(),
        testModeOnly: isStripeTestMode(),
        creem: {
            configured: creem.configured,
            checkoutEnabled: creem.checkoutEnabled,
            merchantApprovalPending: creem.merchantApprovalPending,
            moderationEnabled: creem.moderationEnabled,
            testMode: creem.testMode,
            userMessage: creem.userMessage,
        },
        checkoutAvailable,
        checkoutUnavailableMessage: checkoutAvailable
            ? null
            : (creem.userMessage
                || 'Real checkout is not yet available. Preview packages below; purchases will open after payment provider approval.'),
        conditions: {
            oneTimePayment: true,
            noSavedCardCharges: true,
            creditsGrantedViaWebhookOnly: true,
            separateFromProviderQuota: true,
        },
    });
};

const getAiCreditWallet = async (req, res) => {
    try {
        const wallet = await readWalletSummaryAsync(req.app.locals.db, req.user.email);
        return res.json(wallet);
    } catch (error) {
        return res.status(500).json({ code: 'AI_CREDITS_UNAVAILABLE', message: 'Could not load AI credit wallet.' });
    }
};

const getAiCreditLedger = async (req, res) => {
    try {
        const limit = Number(req.query.limit) || 50;
        const entries = await listLedgerAsync(req.app.locals.db, req.user.email, limit);
        const purchases = entries.filter((e) => e.entryType === 'purchase' || e.entryType === 'refund');
        return res.json({ entries, purchases });
    } catch (error) {
        return res.status(500).json({ code: 'AI_CREDITS_LEDGER_UNAVAILABLE', message: 'Could not load credit history.' });
    }
};

const createAiCreditCheckout = async (req, res) => {
    const packageId = String(req.body.packageId || req.body.package || '').trim().toLowerCase();
    const pack = assertValidCreditPackageId(packageId);
    if (!pack) {
        return res.status(400).json({
            code: 'AI_CREDIT_PACKAGE_INVALID',
            message: 'Choose a valid credit package: starter, plus, pro, or ultimate.',
        });
    }
    if (req.body.priceUsdCents != null && Number(req.body.priceUsdCents) !== pack.priceUsdCents) {
        return res.status(400).json({
            code: 'AI_CREDIT_PRICE_MISMATCH',
            message: 'Package price is set by the server.',
        });
    }
    if (req.body.credits != null && Number(req.body.credits) !== pack.credits) {
        return res.status(400).json({
            code: 'AI_CREDIT_AMOUNT_MISMATCH',
            message: 'Credit quantity is set by the server.',
        });
    }
    const stripeGuard = assertStripeCheckoutAllowed();
    if (!stripeGuard.ok) {
        return res.status(503).json({
            message: stripeGuard.message,
            userMessage: stripeGuardUserMessage(stripeGuard),
            code: stripeGuard.code,
        });
    }
    if (!stripeCheckoutEnabledForDeployment()) {
        return res.status(503).json({ code: 'STRIPE_CHECKOUT_DISABLED', message: 'Stripe checkout is not enabled.' });
    }
    if (shouldPreferStripeOverWayforpay() === false && String(process.env.PAYMENT_PROVIDER || '').toLowerCase() === 'wayforpay') {
        return res.status(409).json({
            code: 'PAYMENT_PROVIDER_CONFLICT',
            message: 'Set PAYMENT_PROVIDER=stripe for AI credit purchases.',
        });
    }
    const stripeConfig = stripeConfigurationReport();
    if (!stripeConfig.ok) {
        return res.status(503).json({
            code: stripeConfig.code || 'STRIPE_INCOMPLETE_CONFIG',
            message: stripeConfig.message,
            userMessage: stripeConfig.userMessage,
        });
    }
    if (!isStripeTestMode() && String(process.env.AI_CREDITS_ALLOW_LIVE_CHECKOUT || '').trim() !== 'true') {
        return res.status(503).json({
            code: 'AI_CREDITS_LIVE_BLOCKED',
            message: 'AI credit checkout is restricted to Stripe TEST MODE until you explicitly enable live checkout.',
        });
    }

    const email = String(req.user.email).trim().toLowerCase();
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY.trim());
    const checkoutOrigin = frontendOrigin(req);
    await ensureStripePaymentMethodDomain(stripe, checkoutOrigin);
    const configuredPriceId = stripePriceIdForCreditPack(packageId);
    const lineItems = configuredPriceId
        ? [{ quantity: 1, price: configuredPriceId }]
        : [{
            quantity: 1,
            price_data: {
                currency: 'usd',
                unit_amount: pack.priceUsdCents,
                product_data: {
                    name: `AllModelAI ${pack.name} Credits`,
                    description: `${pack.credits.toLocaleString()} prepaid AI credits (one-time)`,
                },
            },
        }];
    const testMode = isStripeTestMode();
    const successReturn = `${checkoutOrigin}/checkout?credits=success&package=${encodeURIComponent(packageId)}&session_id={CHECKOUT_SESSION_ID}`;
    const sessionParams = {
        mode: 'payment',
        customer_email: email,
        client_reference_id: String(req.user.id),
        billing_address_collection: 'auto',
        ...stripeCheckoutWalletOptions(),
        line_items: lineItems,
        metadata: {
            purchaseType: 'ai_credit_pack',
            packageId,
            credits: String(pack.credits),
            email,
            priceUsdCents: String(pack.priceUsdCents),
            userName: req.user.name || 'Customer',
            isTestMode: testMode ? 'true' : 'false',
        },
        success_url: successReturn,
        cancel_url: `${checkoutOrigin}/checkout?credits=cancel&package=${encodeURIComponent(packageId)}`,
    };
    const idempotencyKey = `amai_ai_credits_${req.user.id}_${packageId}_${Math.floor(Date.now() / 5000)}`;
    const session = await stripe.checkout.sessions.create(sessionParams, { idempotencyKey });
    return res.status(201).json({
        checkoutUrl: session.url,
        sessionId: session.id,
        package: getPublicCreditPackage(packageId),
        stripeTestMode: testMode,
        publishableKey: publishableKeyFromEnv() || null,
    });
};

async function fulfillAiCreditCheckoutSession(connection, session) {
    if (session.metadata?.purchaseType !== 'ai_credit_pack') return null;
    if (session.payment_status !== 'paid' && session.status !== 'complete') {
        throw new Error('AI credit payment is not complete');
    }
    const packageId = String(session.metadata?.packageId || '').toLowerCase();
    const pack = resolvePackConfig(packageId);
    if (!pack) throw new Error('Unknown AI credit package on session');
    const serverCredits = pack.credits;
    const metaCredits = Number(session.metadata?.credits);
    if (Number.isFinite(metaCredits) && metaCredits !== serverCredits) {
        throw new Error('Credit amount mismatch — grant aborted');
    }
    const serverPrice = pack.priceUsdCents;
    if (session.amount_total == null || !Number.isFinite(Number(session.amount_total))) {
        throw new Error('Paid amount missing on AI credit checkout session');
    }
    if (Number(session.amount_total) !== serverPrice) {
        throw new Error('Paid amount does not match configured package price');
    }
    const email = String(session.metadata?.email || session.customer_details?.email || '').toLowerCase();
    if (!email) throw new Error('Missing email on AI credit checkout session');
    const referenceId = `stripe_checkout_${session.id}`;
    return fulfillAiCreditPackPurchase(connection, {
        email,
        packageId,
        amountPaidCents: session.amount_total,
        referenceId,
        provider: 'stripe',
        requirePaidAmount: true,
        metadata: {
            stripeSessionId: session.id,
            paymentIntent: session.payment_intent || null,
            amountTotal: session.amount_total,
            currency: session.currency || 'usd',
            testMode: session.metadata?.isTestMode === 'true',
        },
    });
}

async function handleAiCreditStripeEvent(connection, event) {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
        const session = event.data.object;
        if (session.metadata?.purchaseType === 'ai_credit_pack') {
            return fulfillAiCreditCheckoutSession(connection, session);
        }
        return null;
    }
    if (event.type === 'checkout.session.async_payment_failed') {
        return { failed: true, sessionId: event.data.object?.id };
    }
    if (event.type === 'charge.refunded') {
        const charge = event.data.object;
        const sessionId = charge.metadata?.checkout_session_id;
        const paymentIntent = charge.payment_intent;
        const refBase = sessionId ? `stripe_checkout_${sessionId}` : `stripe_pi_${paymentIntent}`;
        const priorGrant = await listLedgerAsync(connection, charge.metadata?.email || '', 500);
        const grant = priorGrant.find((e) => e.referenceId === refBase && e.amount > 0);
        if (!grant) return null;
        const refundAmount = Number(charge.amount_refunded || 0);
        const pack = resolvePackConfig(charge.metadata?.packageId);
        const creditsToReverse = pack
            ? Math.min(grant.amount, Math.round((refundAmount / pack.priceUsdCents) * pack.credits))
            : grant.amount;
        return reverseCreditsIdempotentAsync(connection, {
            email: grant.email,
            amount: creditsToReverse,
            referenceId: `stripe_refund_${event.id}`,
            entryType: 'refund',
            metadata: { chargeId: charge.id, eventId: event.id },
        });
    }
    if (event.type === 'charge.dispute.created') {
        const dispute = event.data.object;
        const chargeId = dispute.charge;
        return reverseCreditsIdempotentAsync(connection, {
            email: String(dispute.metadata?.email || '').toLowerCase(),
            amount: Number(dispute.metadata?.credits || 0) || 0,
            referenceId: `stripe_dispute_${dispute.id}`,
            entryType: 'chargeback',
            metadata: { chargeId, disputeId: dispute.id },
        }).catch(() => null);
    }
    return null;
}

/** Read-only status for return URL — never grants credits (webhook-only fulfillment). */
const verifyAiCreditCheckoutSession = async (req, res) => {
    const stripeGuard = assertStripeCheckoutAllowed();
    if (!stripeGuard.ok) return res.status(503).json({ message: stripeGuard.message, code: stripeGuard.code });
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY.trim());
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    if (String(session.metadata?.email).toLowerCase() !== String(req.user.email).toLowerCase()) {
        return res.status(403).json({ message: 'This checkout belongs to another account' });
    }
    if (session.metadata?.purchaseType !== 'ai_credit_pack') {
        return res.status(400).json({ message: 'Not an AI credit checkout session' });
    }
    const referenceId = `stripe_checkout_${session.id}`;
    const existing = await findLedgerByReferenceAsync(req.app.locals.db, referenceId);
    const wallet = await readWalletSummaryAsync(req.app.locals.db, req.user.email);
    if (existing) {
        return res.json({
            status: 'credited',
            credited: true,
            wallet,
            package: getPublicCreditPackage(session.metadata?.packageId),
            ledgerEntry: existing,
        });
    }
    if (session.payment_status === 'paid' || session.status === 'complete') {
        return res.json({
            status: 'processing',
            credited: false,
            message: 'Payment received. Credits will appear after Stripe webhook confirmation (usually within seconds).',
            wallet,
            paymentStatus: session.payment_status,
        });
    }
    return res.json({
        status: 'pending',
        credited: false,
        message: 'Payment not completed yet.',
        wallet,
        paymentStatus: session.payment_status,
    });
};

module.exports = {
    createAiCreditCheckout,
    fulfillAiCreditCheckoutSession,
    getAiCreditLedger,
    getAiCreditPackages,
    getAiCreditWallet,
    handleAiCreditStripeEvent,
    verifyAiCreditCheckoutSession,
};
