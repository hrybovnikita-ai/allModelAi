const crypto = require('node:crypto');
const { publicAppOrigin } = require('../publicAccess');
const { subscriptionPlans, normalizePlanKey, periodEndFor, planSlugForKey } = require('../billing/plans');
const {
    resolveWayforpayCurrency,
    planAmountForCurrency,
    creditPackAmountForCurrency,
    wayforpayLanguageForCurrency,
} = require('../wayforpay/currency');
const {
    aiCreditPlanKey,
    isAiCreditPlanKey,
    parseAiCreditPackageId,
    resolvePaymentProductLabel,
} = require('../wayforpay/paymentProducts');
const { assertValidCreditPackageId, getPublicCreditPackage } = require('../billing/aiCreditPackages');
const { fulfillAiCreditPackPurchase } = require('../billing/aiCreditFulfillment');
const { PAYMENT_STATUS, mapDisplayPaymentStatus } = require('../wayforpay/paymentStatus');
const { activateSubscription } = require('../billing/subscriptions');
const { activateSubscriptionAsync } = require('../billing/subscriptionsAsync');
const { isPostgresConnection } = require('../db/postgresHttpReads');
const {
    insertPaymentAsync,
    getPaymentByReferenceAsync,
    updatePaymentStatusAsync,
    listPaymentsForUserAsync,
} = require('../wayforpay/paymentsStoreAsync');
const { logPayment } = require('../billing/paymentLogger');
const {
    wayforpayConfigured,
    wayforpayCheckoutAvailable,
    wayforpayConfig,
    backendPublicOrigin,
    WAYFORPAY_PAY_URL,
} = require('../wayforpay/config');
const { assertWayforpayCheckoutAllowed } = require('../payments/checkoutInfo');
const { assertWayforpayTestCheckoutAllowed } = require('../payments/wayforpayTestAccess');
const {
    signPurchaseRequest,
    signCallbackPayload,
    verifyCallbackSignature,
    buildCallbackAcceptResponse,
} = require('../wayforpay/crypto');
const {
    ensureWayforpaySchema,
    insertPayment,
    getPaymentByReference,
    updatePaymentStatus,
    listPaymentsForUser,
} = require('../wayforpay/paymentsStore');

const APPROVED_STATUS = 'Approved';

const developerEmails = () => new Set(
    String(process.env.DEVELOPER_EMAILS || '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
);

const createOrderReference = (userId) => `amai_${userId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

const logWayforpayTestEvent = (event, details = {}) => {
    if (process.env.NODE_ENV === 'test') return;
    console.error(`[WayForPay test] ${event}`, details);
};

const initWayforpayStore = (req) => {
    if (!isPostgresConnection(req.app.locals.db)) {
        ensureWayforpaySchema(req.app.locals.db.database);
    }
};

async function wfpGetPayment(appDb, orderReference) {
    return isPostgresConnection(appDb)
        ? getPaymentByReferenceAsync(appDb, orderReference)
        : getPaymentByReference(appDb.database, orderReference);
}

async function wfpInsertPayment(appDb, row) {
    return isPostgresConnection(appDb)
        ? insertPaymentAsync(appDb, row)
        : insertPayment(appDb.database, row);
}

async function wfpUpdatePayment(appDb, orderReference, patch) {
    return isPostgresConnection(appDb)
        ? updatePaymentStatusAsync(appDb, orderReference, patch)
        : updatePaymentStatus(appDb.database, orderReference, patch);
}

const insertPendingPayment = async (appDb, { userId, email, planKey, cfg, currency }) => {
    const checkoutCurrency = resolveWayforpayCurrency(currency, cfg.currency);
    let amount;
    let expiresAt = null;
    if (isAiCreditPlanKey(planKey)) {
        const packageId = parseAiCreditPackageId(planKey);
        if (!packageId) {
            throw Object.assign(new Error('Invalid credit package.'), { status: 400 });
        }
        amount = creditPackAmountForCurrency(packageId, checkoutCurrency);
    } else {
        const plan = subscriptionPlans[planKey];
        if (!plan) {
            throw Object.assign(new Error('Invalid subscription plan.'), { status: 400 });
        }
        amount = planAmountForCurrency(planKey, checkoutCurrency);
        expiresAt = periodEndFor(plan.interval);
    }
    if (!amount) {
        throw Object.assign(new Error('Invalid plan amount for checkout.'), { status: 400 });
    }
    const orderReference = createOrderReference(userId);
    const now = new Date().toISOString();
    const merchantAccount = cfg.merchantAccount || 'allmodelai_test';
    await wfpInsertPayment(appDb, {
        orderReference,
        userEmail: email,
        userId,
        planKey,
        amount: Number(amount),
        currency: checkoutCurrency,
        status: PAYMENT_STATUS.CREATED,
        merchantAccount,
        paymentProvider: 'wayforpay',
        isTest: cfg.testMode,
        expiresAt,
        createdAt: now,
        updatedAt: now,
    });
    await wfpUpdatePayment(appDb, orderReference, { status: PAYMENT_STATUS.PENDING });
    const plan = subscriptionPlans[planKey];
    return { orderReference, amount, plan, merchantAccount, currency: checkoutCurrency };
};

const simulateMockApprovedCallback = async (appDb, paymentRow, cfg) => {
    if (paymentRow.status === PAYMENT_STATUS.PAID) {
        return { ok: true, alreadyProcessed: true };
    }

    const callbackPayload = {
        merchantAccount: paymentRow.merchantAccount || cfg.merchantAccount || 'allmodelai_test',
        orderReference: paymentRow.orderReference,
        amount: String(Number(paymentRow.amount).toFixed(2)),
        currency: paymentRow.currency,
        authCode: 'MOCK_OK',
        cardPan: '42****4242',
        transactionStatus: APPROVED_STATUS,
        reasonCode: '1100',
    };

    const secretKey = cfg.secretKey?.trim();
    if (secretKey) {
        callbackPayload.merchantSignature = signCallbackPayload(callbackPayload, secretKey);
        const result = await processWayforpayCallbackPayload(appDb, callbackPayload, cfg);
        if (result.status !== 200) {
            return {
                ok: false,
                status: result.status,
                message: result.body?.message || 'Simulated callback verification failed',
            };
        }
        return { ok: true, alreadyProcessed: false, simulatedCallback: true };
    }

    await fulfillApprovedPayment(appDb, paymentRow, callbackPayload);
    return { ok: true, alreadyProcessed: false, simulatedCallback: true };
};

const fulfillApprovedPayment = async (appDb, paymentRow, callbackPayload) => {
    if (paymentRow.status === PAYMENT_STATUS.PAID) {
        return { alreadyProcessed: true };
    }
    const paidAt = new Date().toISOString();

    if (isAiCreditPlanKey(paymentRow.planKey)) {
        const packageId = parseAiCreditPackageId(paymentRow.planKey);
        const pack = assertValidCreditPackageId(packageId);
        if (!pack) {
            throw Object.assign(new Error('Unknown credit package on paid order.'), { status: 500 });
        }
        await fulfillAiCreditPackPurchase(appDb, {
            email: paymentRow.userEmail,
            packageId,
            amountPaidCents: pack.priceUsdCents,
            referenceId: `wayforpay_${paymentRow.orderReference}`,
            provider: 'wayforpay',
            metadata: {
                orderReference: paymentRow.orderReference,
                currency: paymentRow.currency,
                isTestPayment: Boolean(paymentRow.isTest),
            },
        });
    } else {
        const plan = subscriptionPlans[paymentRow.planKey];
        const expiresAt = paymentRow.expiresAt || (plan ? periodEndFor(plan.interval) : null);
        const activationPayload = {
            email: paymentRow.userEmail,
            planKey: paymentRow.planKey,
            name: paymentRow.userEmail,
            stripeCustomerId: null,
            stripeSubscriptionId: `wayforpay_${paymentRow.orderReference}`,
            paymentProvider: 'wayforpay',
            orderReference: paymentRow.orderReference,
            paymentStatus: 'successful',
            amount: paymentRow.amount,
            currency: paymentRow.currency,
            isTestPayment: Boolean(paymentRow.isTest),
        };
        if (isPostgresConnection(appDb)) {
            await activateSubscriptionAsync(appDb, activationPayload);
        } else {
            activateSubscription(appDb, activationPayload);
        }
        await wfpUpdatePayment(appDb, paymentRow.orderReference, {
            expiresAt,
        });
    }

    await wfpUpdatePayment(appDb, paymentRow.orderReference, {
        status: PAYMENT_STATUS.PAID,
        transactionStatus: callbackPayload.transactionStatus || APPROVED_STATUS,
        reasonCode: callbackPayload.reasonCode != null ? String(callbackPayload.reasonCode) : null,
        paidAt,
        callbackReceivedAt: paidAt,
    });
    return { alreadyProcessed: false };
};

const processWayforpayCallbackPayload = async (appDb, payload, cfg) => {
    if (payload.merchantAccount && cfg.merchantAccount && payload.merchantAccount !== cfg.merchantAccount) {
        logPayment('Callback rejected: invalid merchant account', { orderReference: payload.orderReference });
        return { status: 400, body: { message: 'Invalid merchant account' } };
    }

    let signatureOk = false;
    try {
        signatureOk = verifyCallbackSignature(payload, cfg.secretKey);
    } catch {
        signatureOk = false;
    }
    if (!signatureOk) {
        logPayment('Callback rejected: invalid signature', { orderReference: payload.orderReference });
        return { status: 400, body: { message: 'Invalid callback signature' } };
    }
    logPayment('Signature verified', { orderReference: payload.orderReference });

    const orderReference = String(payload.orderReference || '');
    if (!orderReference) {
        return { status: 400, body: { message: 'Missing orderReference' } };
    }

    const paymentRow = await wfpGetPayment(appDb, orderReference);
    if (!paymentRow) {
        return { status: 404, body: { message: 'Unknown order reference' } };
    }

    const callbackAmount = Number(payload.amount);
    if (!Number.isNaN(callbackAmount) && Math.abs(callbackAmount - paymentRow.amount) > 0.01) {
        await wfpUpdatePayment(appDb, orderReference, { status: PAYMENT_STATUS.ERROR });
        return { status: 400, body: { message: 'Amount mismatch' } };
    }
    if (payload.currency && String(payload.currency).toUpperCase() !== paymentRow.currency) {
        await wfpUpdatePayment(appDb, orderReference, { status: PAYMENT_STATUS.ERROR });
        return { status: 400, body: { message: 'Currency mismatch' } };
    }

    const transactionStatus = String(payload.transactionStatus || '');
    if (transactionStatus === APPROVED_STATUS) {
        const fulfillment = await fulfillApprovedPayment(appDb, paymentRow, payload);
        if (!fulfillment.alreadyProcessed) {
            logPayment('Payment approved', { orderReference, plan: paymentRow.planKey });
        } else {
            logPayment('Duplicate approved callback ignored', { orderReference });
        }
    } else if (['Declined', 'Expired'].includes(transactionStatus)) {
        logPayment('Payment failed', { orderReference, transactionStatus });
        await wfpUpdatePayment(appDb, orderReference, {
            status: PAYMENT_STATUS.DECLINED,
            transactionStatus,
            reasonCode: payload.reasonCode != null ? String(payload.reasonCode) : null,
            callbackReceivedAt: new Date().toISOString(),
        });
    } else if (transactionStatus === 'Refunded') {
        await wfpUpdatePayment(appDb, orderReference, {
            status: PAYMENT_STATUS.REFUNDED,
            transactionStatus,
            callbackReceivedAt: new Date().toISOString(),
        });
    } else {
        await wfpUpdatePayment(appDb, orderReference, {
            status: PAYMENT_STATUS.PENDING,
            transactionStatus: transactionStatus || null,
            callbackReceivedAt: new Date().toISOString(),
        });
    }

    return {
        status: 200,
        body: buildCallbackAcceptResponse(orderReference, cfg.secretKey),
    };
};

const resolveCheckoutProduct = (req) => {
    const packageId = String(req.body.packageId || req.body.package || '').trim().toLowerCase();
    const purchaseType = String(req.body.purchaseType || '').trim().toLowerCase();
    if (packageId || purchaseType === 'ai_credits' || purchaseType === 'ai_credit_pack') {
        const pack = assertValidCreditPackageId(packageId);
        if (!pack) {
            return { error: { status: 400, message: 'Choose a valid credit package: starter, plus, pro, or ultimate.' } };
        }
        if (req.body.priceUsdCents != null && Number(req.body.priceUsdCents) !== pack.priceUsdCents) {
            return { error: { status: 400, message: 'Package price is set by the server.' } };
        }
        if (req.body.credits != null && Number(req.body.credits) !== pack.credits) {
            return { error: { status: 400, message: 'Credit quantity is set by the server.' } };
        }
        return {
            planKey: aiCreditPlanKey(pack.id),
            productLabel: resolvePaymentProductLabel(aiCreditPlanKey(pack.id)),
            purchaseType: 'ai_credits',
            packageId: pack.id,
            planName: `${pack.name} Credits`,
        };
    }
    const planKey = normalizePlanKey(req.body.plan);
    const plan = subscriptionPlans[planKey];
    if (!plan || plan.amount <= 0) {
        return { error: { status: 400, message: 'Choose a valid paid subscription plan' } };
    }
    return {
        planKey,
        productLabel: resolvePaymentProductLabel(planKey),
        purchaseType: 'subscription',
        plan,
        planName: plan.name,
    };
};

const buildHostedWayforpayCheckoutPayload = ({
    req,
    cfg,
    email,
    planKey,
    productLabel,
    orderReference,
    amount,
    storedCurrency,
    purchaseType,
    packageId,
}) => {
    const orderDate = Math.floor(Date.now() / 1000);
    const productName = [productLabel];
    const productCount = ['1'];
    const productPrice = [amount];
    const frontendOrigin = publicAppOrigin(req).replace(/\/$/, '');
    const serviceBase = backendPublicOrigin(req);
    if (!serviceBase) {
        return {
            error: {
                status: 503,
                message: 'Set BACKEND_PUBLIC_URL (or BACKEND_ORIGIN) so WayForPay can reach the payment callback.',
            },
        };
    }

    const returnUrl = purchaseType === 'ai_credits'
        ? `${frontendOrigin}/checkout?credits=success&package=${encodeURIComponent(packageId)}&orderReference=${encodeURIComponent(orderReference)}`
        : `${frontendOrigin}/checkout/success?plan=${encodeURIComponent(planSlugForKey(planKey))}&orderReference=${encodeURIComponent(orderReference)}`;

    const purchasePayload = {
        merchantAccount: cfg.merchantAccount,
        merchantDomainName: cfg.merchantDomainName,
        orderReference,
        orderDate,
        amount,
        currency: storedCurrency,
        productName,
        productCount,
        productPrice,
    };

    const merchantSignature = signPurchaseRequest(purchasePayload, cfg.secretKey);
    const fields = {
        merchantAccount: cfg.merchantAccount,
        merchantAuthType: 'SimpleSignature',
        merchantDomainName: cfg.merchantDomainName,
        merchantTransactionType: 'AUTO',
        merchantTransactionSecureType: 'AUTO',
        merchantSignature,
        orderReference,
        orderDate: String(orderDate),
        amount,
        currency: storedCurrency,
        productName,
        productCount,
        productPrice,
        clientEmail: email,
        clientAccountId: email,
        language: wayforpayLanguageForCurrency(storedCurrency),
        returnUrl,
        serviceUrl: `${serviceBase}/api/payments/wayforpay/callback`,
    };

    return {
        body: {
            provider: 'wayforpay',
            mockCheckout: false,
            payUrl: WAYFORPAY_PAY_URL,
            orderReference,
            fields,
            testMode: false,
            purchaseType,
            packageId: packageId || null,
            plan: purchaseType === 'subscription' ? planKey : null,
            currency: storedCurrency,
            amount,
        },
    };
};

const createWayforpayPayment = async (req, res) => {
    initWayforpayStore(req);
    if (!wayforpayCheckoutAvailable()) {
        return res.status(503).json({ message: 'WayForPay is not configured. Set WAYFORPAY_DOMAIN and WAYFORPAY_TEST_MODE or full merchant credentials.' });
    }
    const cfg = wayforpayConfig();
    if (!cfg.usdCheckoutEnabled && resolveWayforpayCurrency(req.body?.currency, cfg.currency) === 'USD') {
        return res.status(503).json({
            message: 'USD checkout is not enabled. Set WAYFORPAY_CURRENCY=USD and confirm USD is activated for your WayForPay merchant account.',
        });
    }
    if (!cfg.testMode) {
        const liveBlock = assertWayforpayCheckoutAllowed();
        if (liveBlock) {
            return res.status(403).json({ message: liveBlock, testModeRequired: true });
        }
        if (!wayforpayConfigured()) {
            return res.status(503).json({ message: 'Live WayForPay requires merchant account and secret key on the server.' });
        }
    }

    const product = resolveCheckoutProduct(req);
    if (product.error) {
        return res.status(product.error.status).json({ message: product.error.message });
    }
    const {
        planKey,
        productLabel,
        purchaseType,
        packageId,
        planName,
        plan,
    } = product;

    const email = String(req.user.email).trim().toLowerCase();
    if (!cfg.testMode && purchaseType === 'subscription' && developerEmails().has(email)) {
        return res.status(400).json({
            message: 'Developer accounts use test subscription flow without WayForPay.',
            useMockSubscribe: true,
        });
    }

    const checkoutCurrency = resolveWayforpayCurrency(req.body?.currency, cfg.currency);
    let orderReference;
    let amount;
    let storedCurrency;
    try {
        ({ orderReference, amount, currency: storedCurrency } = await insertPendingPayment(req.app.locals.db, {
            userId: req.user.id,
            email,
            planKey,
            cfg,
            currency: checkoutCurrency,
        }));
    } catch (error) {
        if (error.status === 400) {
            return res.status(400).json({ message: error.message || 'Invalid checkout request.' });
        }
        throw error;
    }

    if (cfg.testMode) {
        if (!(await assertWayforpayTestCheckoutAllowed(req, res))) return undefined;
        logPayment('Checkout created (TEST MODE mock)', {
            orderReference,
            plan: planKey,
            purchaseType,
            email,
            currency: storedCurrency,
        });
        return res.status(201).json({
            provider: 'wayforpay',
            mockCheckout: true,
            testMode: true,
            orderReference,
            plan: purchaseType === 'subscription' ? planKey : null,
            packageId: packageId || null,
            purchaseType,
            planName,
            amount,
            currency: storedCurrency,
            message: 'Test checkout only — no redirect to WayForPay. Complete payment with mock-complete.',
        });
    }

    logPayment('Checkout created (live hosted)', {
        orderReference,
        plan: planKey,
        purchaseType,
        email,
        currency: storedCurrency,
    });

    const hosted = buildHostedWayforpayCheckoutPayload({
        req,
        cfg,
        email,
        planKey,
        productLabel,
        orderReference,
        amount,
        storedCurrency,
        purchaseType,
        packageId,
    });
    if (hosted.error) {
        return res.status(hosted.error.status).json({ message: hosted.error.message });
    }
    return res.status(201).json(hosted.body);
};

const createWayforpayCreditPayment = async (req, res) => {
    req.body = {
        ...(req.body || {}),
        purchaseType: 'ai_credits',
    };
    return createWayforpayPayment(req, res);
};

const buildTestCheckoutSuccessBody = (planKey, orderReference, { alreadyProcessed = false } = {}) => {
    if (isAiCreditPlanKey(planKey)) {
        const packageId = parseAiCreditPackageId(planKey);
        const pack = packageId ? getPublicCreditPackage(packageId) : null;
        return {
            success: true,
            mockCheckout: true,
            paid: true,
            testMode: true,
            orderReference,
            purchaseType: 'ai_credits',
            packageId,
            planName: pack?.name ? `${pack.name} Credits` : planKey,
            creditsGranted: pack?.creditsIncluded ?? null,
            alreadyProcessed,
            message: `Test payment successful — ${pack?.name || 'AI credits'} added to your wallet.`,
        };
    }
    const plan = subscriptionPlans[planKey];
    return {
        success: true,
        mockCheckout: true,
        paid: true,
        testMode: true,
        orderReference,
        purchaseType: 'subscription',
        plan: planKey,
        planName: plan?.name || planKey,
        requestLimit: plan?.limit ?? null,
        billingInterval: plan?.interval ?? null,
        alreadyProcessed,
        message: `Test payment successful — ${plan?.name || planKey} activated.`,
    };
};

const completeMockWayforpayPayment = async (req, res) => {
    try {
        initWayforpayStore(req);
        const cfg = wayforpayConfig();
        if (!cfg.testMode) {
            return res.status(403).json({ message: 'Mock checkout is only available when WAYFORPAY_TEST_MODE=true.' });
        }
        if (!(await assertWayforpayTestCheckoutAllowed(req, res))) return undefined;
        if (!wayforpayCheckoutAvailable()) {
            return res.status(503).json({ message: 'WayForPay test checkout is not configured.' });
        }

        const orderReference = String(req.body.orderReference || '').trim();
        if (!orderReference) {
            return res.status(400).json({ message: 'orderReference is required.' });
        }

        const paymentRow = await wfpGetPayment(req.app.locals.db, orderReference);
        if (!paymentRow) {
            return res.status(404).json({ message: 'Payment not found' });
        }
        const email = String(req.user.email).trim().toLowerCase();
        if (paymentRow.userEmail !== email) {
            return res.status(403).json({ message: 'This payment belongs to another account' });
        }

        if (paymentRow.status === PAYMENT_STATUS.PAID) {
            return res.json(buildTestCheckoutSuccessBody(paymentRow.planKey, orderReference, { alreadyProcessed: true }));
        }

        const simulation = await simulateMockApprovedCallback(req.app.locals.db, paymentRow, cfg);
        if (!simulation.ok) {
            logWayforpayTestEvent('mock-complete failed', {
                orderReference,
                userId: req.user.id,
                status: simulation.status,
                reason: simulation.message,
            });
            return res.status(simulation.status || 500).json({ message: simulation.message || 'Mock payment failed' });
        }

        return res.json(buildTestCheckoutSuccessBody(paymentRow.planKey, orderReference, {
            alreadyProcessed: simulation.alreadyProcessed,
        }));
    } catch (error) {
        logWayforpayTestEvent('mock-complete error', { userId: req.user?.id, reason: error.message });
        return res.status(500).json({ message: 'Mock payment could not be completed.' });
    }
};

const completeTestWayforpayCheckout = async (req, res) => {
    const cfg = wayforpayConfig();
    let planKey = null;
    try {
        initWayforpayStore(req);
        if (!cfg.testMode) {
            return res.status(403).json({ message: 'Test checkout is only available when WAYFORPAY_TEST_MODE=true.' });
        }
        if (!(await assertWayforpayTestCheckoutAllowed(req, res))) return undefined;
        if (!wayforpayCheckoutAvailable()) {
            return res.status(503).json({ message: 'WayForPay test checkout is not configured.' });
        }

        const product = resolveCheckoutProduct(req);
        if (product.error) {
            return res.status(product.error.status).json({ message: product.error.message });
        }
        planKey = product.planKey;

        const email = String(req.user.email).trim().toLowerCase();
        const { orderReference } = await insertPendingPayment(req.app.locals.db, {
            userId: req.user.id,
            email,
            planKey,
            cfg,
        });

        const paymentRow = await wfpGetPayment(req.app.locals.db, orderReference);
        const simulation = await simulateMockApprovedCallback(req.app.locals.db, paymentRow, cfg);
        if (!simulation.ok) {
            logWayforpayTestEvent('test-checkout simulation failed', {
                orderReference,
                userId: req.user.id,
                plan: planKey,
                status: simulation.status,
                reason: simulation.message,
            });
            return res.status(simulation.status || 500).json({ message: simulation.message || 'Test payment failed' });
        }

        return res.status(200).json(buildTestCheckoutSuccessBody(planKey, orderReference, {
            alreadyProcessed: simulation.alreadyProcessed,
        }));
    } catch (error) {
        logWayforpayTestEvent('test-checkout error', {
            userId: req.user?.id,
            plan: planKey,
            reason: error.message,
        });
        return res.status(500).json({ message: 'Test payment could not be completed.' });
    }
};

const wayforpayCallback = async (req, res) => {
    try {
        initWayforpayStore(req);
        if (!wayforpayConfigured()) {
            return res.status(503).send('WayForPay is not configured');
        }
        const cfg = wayforpayConfig();
        if (cfg.testMode) {
            return res.status(403).json({ message: 'External WayForPay callbacks are ignored in test mode. Use mock-complete.' });
        }
        const payload = req.body && typeof req.body === 'object' ? req.body : {};
        const result = await processWayforpayCallbackPayload(req.app.locals.db, payload, cfg);
        return res.status(result.status).json(result.body);
    } catch (error) {
        if (process.env.NODE_ENV === 'test') {
            return res.status(500).json({ message: error.message || 'WayForPay callback processing failed' });
        }
        return res.status(500).json({ message: 'WayForPay callback processing failed' });
    }
};

const resolveHistoryPlanName = (planKey) => {
    if (isAiCreditPlanKey(planKey)) {
        const packageId = parseAiCreditPackageId(planKey);
        const pack = packageId ? getPublicCreditPackage(packageId) : null;
        return pack?.name ? `${pack.name} Credits` : planKey;
    }
    const plan = subscriptionPlans[planKey];
    return plan?.name || planKey;
};

const mapPaymentHistoryRow = (row) => ({
    orderReference: row.orderReference,
    plan: row.planKey,
    planName: resolveHistoryPlanName(row.planKey),
    purchaseType: isAiCreditPlanKey(row.planKey) ? 'ai_credits' : 'subscription',
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    displayStatus: mapDisplayPaymentStatus(row.status),
    test: Boolean(row.isTest),
    createdAt: row.createdAt,
    paidAt: row.paidAt || null,
});

const getPaymentHistory = async (req, res) => {
    initWayforpayStore(req);
    const email = String(req.user.email).trim().toLowerCase();
    const limit = Number(req.query.limit) || 25;
    const rows = isPostgresConnection(req.app.locals.db)
        ? await listPaymentsForUserAsync(req.app.locals.db, email, limit)
        : listPaymentsForUser(req.app.locals.db.database, email, limit);
    return res.json({
        payments: rows.map(mapPaymentHistoryRow),
    });
};

const getWayforpayPaymentStatus = async (req, res) => {
    initWayforpayStore(req);
    const orderReference = String(req.params.orderReference || '');
    const paymentRow = await wfpGetPayment(req.app.locals.db, orderReference);
    if (!paymentRow) {
        return res.status(404).json({ message: 'Payment not found' });
    }
    const email = String(req.user.email).trim().toLowerCase();
    if (paymentRow.userEmail !== email) {
        return res.status(403).json({ message: 'This payment belongs to another account' });
    }
    return res.json({
        orderReference: paymentRow.orderReference,
        status: paymentRow.status,
        displayStatus: mapDisplayPaymentStatus(paymentRow.status),
        plan: paymentRow.planKey,
        amount: paymentRow.amount,
        currency: paymentRow.currency,
        paid: paymentRow.status === PAYMENT_STATUS.PAID,
        planName: resolveHistoryPlanName(paymentRow.planKey),
        purchaseType: isAiCreditPlanKey(paymentRow.planKey) ? 'ai_credits' : 'subscription',
    });
};

module.exports = {
    createWayforpayPayment,
    createWayforpayCreditPayment,
    completeMockWayforpayPayment,
    completeTestWayforpayCheckout,
    wayforpayCallback,
    getWayforpayPaymentStatus,
    getPaymentHistory,
    processWayforpayCallbackPayload,
    PAYMENT_STATUS,
    wayforpayConfigured,
    wayforpayCheckoutAvailable,
};
