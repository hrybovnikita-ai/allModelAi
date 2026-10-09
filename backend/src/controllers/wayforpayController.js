const crypto = require('node:crypto');
const { publicAppOrigin } = require('../publicAccess');
const { subscriptionPlans, normalizePlanKey, planAmountDecimal, periodEndFor, planSlugForKey } = require('../billing/plans');
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
const { requirePaymentSandboxUser } = require('../payments/paymentSandbox');
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
const PAYMENT_STATUS = {
    CREATED: 'created',
    PENDING: 'pending',
    PAID: 'paid',
    DECLINED: 'declined',
    CANCELED: 'canceled',
    ERROR: 'error',
};

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

const insertPendingTestPayment = async (appDb, { userId, email, planKey, cfg }) => {
    const plan = subscriptionPlans[planKey];
    const amount = planAmountDecimal(planKey);
    const orderReference = createOrderReference(userId);
    const now = new Date().toISOString();
    const merchantAccount = cfg.merchantAccount || 'allmodelai_test';
    await wfpInsertPayment(appDb, {
        orderReference,
        userEmail: email,
        userId,
        planKey,
        amount: Number(amount),
        currency: cfg.currency,
        status: PAYMENT_STATUS.CREATED,
        merchantAccount,
        paymentProvider: 'wayforpay',
        isTest: cfg.testMode,
        expiresAt: periodEndFor(plan.interval),
        createdAt: now,
        updatedAt: now,
    });
    await wfpUpdatePayment(appDb, orderReference, { status: PAYMENT_STATUS.PENDING });
    return { orderReference, amount, plan, merchantAccount };
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
    const plan = subscriptionPlans[paymentRow.planKey];
    const paidAt = new Date().toISOString();
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
        status: PAYMENT_STATUS.PAID,
        transactionStatus: callbackPayload.transactionStatus || APPROVED_STATUS,
        reasonCode: callbackPayload.reasonCode != null ? String(callbackPayload.reasonCode) : null,
        paidAt,
        callbackReceivedAt: paidAt,
        expiresAt,
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
            status: PAYMENT_STATUS.CANCELED,
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

const createWayforpayPayment = async (req, res) => {
    initWayforpayStore(req);
    if (!wayforpayCheckoutAvailable()) {
        return res.status(503).json({ message: 'WayForPay is not configured. Set WAYFORPAY_DOMAIN and WAYFORPAY_TEST_MODE or full merchant credentials.' });
    }
    const cfg = wayforpayConfig();
    if (!cfg.testMode) {
        const liveBlock = assertWayforpayCheckoutAllowed();
        if (liveBlock) {
            return res.status(403).json({ message: liveBlock, testModeRequired: true });
        }
        if (!wayforpayConfigured()) {
            return res.status(503).json({ message: 'Live WayForPay requires merchant account and secret key on the server.' });
        }
    }

    const planKey = normalizePlanKey(req.body.plan);
    const plan = subscriptionPlans[planKey];
    if (!plan || plan.amount <= 0) {
        return res.status(400).json({ message: 'Choose a valid paid subscription plan' });
    }
    const email = String(req.user.email).trim().toLowerCase();
    if (!cfg.testMode && developerEmails().has(email)) {
        return res.status(400).json({
            message: 'Developer accounts use test subscription flow without WayForPay.',
            useMockSubscribe: true,
        });
    }

    const { orderReference, amount } = await insertPendingTestPayment(req.app.locals.db, {
        userId: req.user.id,
        email,
        planKey,
        cfg,
    });

    if (cfg.testMode) {
        if (!(await requirePaymentSandboxUser(req, res))) return undefined;
        logPayment('Checkout created (TEST MODE mock)', { orderReference, plan: planKey, email });
        return res.status(201).json({
            provider: 'wayforpay',
            mockCheckout: true,
            testMode: true,
            orderReference,
            plan: planKey,
            planName: plan.name,
            amount,
            currency: cfg.currency,
            message: 'Test checkout only — no redirect to WayForPay. Complete payment with mock-complete.',
        });
    }

    logPayment('Checkout created (live hosted)', { orderReference, plan: planKey, email });

    const orderDate = Math.floor(Date.now() / 1000);
    const productName = [`AllModelAI ${plan.name}`];
    const productCount = ['1'];
    const productPrice = [amount];
    const frontendOrigin = publicAppOrigin(req).replace(/\/$/, '');
    const serviceBase = backendPublicOrigin(req);
    if (!serviceBase) {
        return res.status(503).json({
            message: 'Set BACKEND_PUBLIC_URL (or BACKEND_ORIGIN) so WayForPay can reach the payment callback.',
        });
    }

    const purchasePayload = {
        merchantAccount: cfg.merchantAccount,
        merchantDomainName: cfg.merchantDomainName,
        orderReference,
        orderDate,
        amount,
        currency: cfg.currency,
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
        currency: cfg.currency,
        productName,
        productCount,
        productPrice,
        clientEmail: email,
        clientAccountId: email,
        language: 'EN',
        returnUrl: `${frontendOrigin}/checkout/success?plan=${encodeURIComponent(planSlugForKey(planKey))}&orderReference=${encodeURIComponent(orderReference)}`,
        serviceUrl: `${serviceBase}/api/payments/wayforpay/callback`,
    };

    return res.status(201).json({
        provider: 'wayforpay',
        mockCheckout: false,
        payUrl: WAYFORPAY_PAY_URL,
        orderReference,
        fields,
        testMode: false,
    });
};

const buildTestCheckoutSuccessBody = (planKey, orderReference, { alreadyProcessed = false } = {}) => {
    const plan = subscriptionPlans[planKey];
    return {
        success: true,
        mockCheckout: true,
        paid: true,
        testMode: true,
        orderReference,
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
        if (!(await requirePaymentSandboxUser(req, res))) return undefined;
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
        if (!(await requirePaymentSandboxUser(req, res))) return undefined;
        if (!wayforpayCheckoutAvailable()) {
            return res.status(503).json({ message: 'WayForPay test checkout is not configured.' });
        }

        planKey = normalizePlanKey(req.body.plan);
        const plan = subscriptionPlans[planKey];
        if (!plan || plan.amount <= 0) {
            return res.status(400).json({ message: 'Choose a valid paid subscription plan' });
        }

        const email = String(req.user.email).trim().toLowerCase();
        const { orderReference } = await insertPendingTestPayment(req.app.locals.db, {
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

const mapPaymentHistoryRow = (row) => {
    const plan = subscriptionPlans[row.planKey];
    return {
        orderReference: row.orderReference,
        plan: row.planKey,
        planName: plan?.name || row.planKey,
        amount: row.amount,
        currency: row.currency,
        status: row.status,
        test: Boolean(row.isTest),
        createdAt: row.createdAt,
        paidAt: row.paidAt || null,
    };
};

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
    const plan = subscriptionPlans[paymentRow.planKey];
    return res.json({
        orderReference: paymentRow.orderReference,
        status: paymentRow.status,
        plan: paymentRow.planKey,
        amount: paymentRow.amount,
        currency: paymentRow.currency,
        paid: paymentRow.status === PAYMENT_STATUS.PAID,
        planName: plan?.name || paymentRow.planKey,
    });
};

module.exports = {
    createWayforpayPayment,
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
