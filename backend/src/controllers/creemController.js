const crypto = require('crypto');
const {
    assertValidCreditPackageId,
    creemProductIdForCreditPack,
    resolvePackageIdFromCreemProduct,
    resolvePackConfig,
} = require('../billing/aiCreditPackages');
const { fulfillAiCreditPackPurchase } = require('../billing/aiCreditFulfillment');
const { reverseCreditsIdempotentAsync, findLedgerByReferenceAsync } = require('../billing/aiCreditLedger');
const {
    assertCreemCheckoutAllowed,
    creemApiBaseUrl,
    creemConfigurationReport,
    getCreemApiKey,
    getCreemWebhookSecret,
} = require('../payments/creemConfig');
const { upsertCreemOrder } = require('../payments/creemOrderStore');
const { normalizeRawBody, verifyCreemWebhookSignature } = require('../payments/creemWebhookVerify');
const {
    claimCreemEvent,
    releaseCreemEventClaim,
} = require('../payments/creemWebhookIdempotency');

const PAID_ORDER_STATUSES = new Set(['paid', 'completed', 'complete', 'success', 'succeeded']);

function frontendOrigin(req) {
    const configured = String(process.env.FRONTEND_ORIGIN || process.env.CLIENT_URL || '').trim();
    if (configured) return configured.replace(/\/$/, '');
    const origin = req.get('origin');
    if (origin) return origin.replace(/\/$/, '');
    return 'http://localhost:5173';
}

function validationError(message, code = 'CREEM_PAYMENT_INVALID') {
    const error = new Error(message);
    error.code = code;
    error.permanent = true;
    return error;
}

function extractProductId(checkout) {
    return (
        checkout?.order?.product
        || checkout?.order?.product_id
        || checkout?.product?.id
        || checkout?.product_id
        || null
    );
}

function extractAmountCents(checkout) {
    const raw = checkout?.order?.amount
        ?? checkout?.order?.amount_paid
        ?? checkout?.amount
        ?? checkout?.product?.price;
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
}

function extractCurrency(checkout) {
    return String(
        checkout?.order?.currency
        || checkout?.currency
        || checkout?.product?.currency
        || 'USD',
    ).trim().toUpperCase();
}

function resolvePackageFromCheckout(checkout) {
    const metadata = checkout?.metadata || {};
    const metadataPackageId = String(metadata.packageId || '').trim().toLowerCase();
    const productId = extractProductId(checkout);
    const fromProduct = resolvePackageIdFromCreemProduct(productId);
    if (fromProduct && metadataPackageId && fromProduct !== metadataPackageId) {
        throw validationError('Creem product does not match package metadata', 'CREEM_PACKAGE_MISMATCH');
    }
    const packageId = fromProduct || metadataPackageId;
    if (!packageId) {
        throw validationError('Unknown AI credit package on Creem checkout', 'CREEM_PACKAGE_UNKNOWN');
    }
    const configuredProduct = creemProductIdForCreditPack(packageId);
    if (configuredProduct && productId && configuredProduct !== String(productId).trim()) {
        throw validationError('Creem product id is not mapped to this credit package', 'CREEM_PRODUCT_MISMATCH');
    }
    return resolvePackConfig(packageId);
}

const getCreemCheckoutStatus = (_req, res) => {
    const report = creemConfigurationReport();
    return res.json({
        provider: 'creem',
        ...report,
    });
};

const createAiCreditCreemCheckout = async (req, res) => {
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
    const guard = assertCreemCheckoutAllowed();
    if (!guard.ok) {
        return res.status(503).json({
            code: guard.code,
            message: guard.message,
            userMessage: guard.report?.userMessage || guard.message,
            merchantApprovalPending: guard.report?.merchantApprovalPending ?? true,
        });
    }
    const productId = creemProductIdForCreditPack(packageId);
    if (!productId) {
        return res.status(503).json({
            code: 'CREEM_PRODUCT_NOT_CONFIGURED',
            message: `Set CREEM_PRODUCT_AI_CREDITS_${packageId.toUpperCase()} for this package.`,
        });
    }
    const email = String(req.user.email).trim().toLowerCase();
    const checkoutOrigin = frontendOrigin(req);
    const requestId = `amai_creem_${req.user.id}_${packageId}_${crypto.randomUUID()}`;
    const body = {
        product_id: productId,
        request_id: requestId,
        success_url: `${checkoutOrigin}/checkout?credits=success&provider=creem&package=${encodeURIComponent(packageId)}`,
        customer: { email },
        metadata: {
            purchaseType: 'ai_credit_pack',
            packageId,
            credits: String(pack.credits),
            email,
            priceUsdCents: String(pack.priceUsdCents),
            userId: String(req.user.id),
        },
    };
    const apiKey = getCreemApiKey();
    const response = await fetch(`${creemApiBaseUrl()}/v1/checkouts`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
        },
        body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        return res.status(502).json({
            code: 'CREEM_CHECKOUT_FAILED',
            message: payload?.message || payload?.error || 'Creem checkout could not be created.',
        });
    }
    const checkoutUrl = payload.checkout_url || payload.url || payload.checkoutUrl;
    const checkoutId = payload.id || payload.checkout_id;
    if (checkoutId) {
        await upsertCreemOrder(req.app.locals.db, {
            orderId: requestId,
            checkoutId,
            email,
            packageId,
            amountCents: pack.priceUsdCents,
            currency: 'USD',
            status: 'pending',
            metadata: { requestId, checkoutId },
        });
    }
    return res.status(201).json({
        checkoutUrl,
        checkoutId,
        requestId,
        packageId,
        provider: 'creem',
    });
};

async function handleCreemCheckoutCompleted(connection, checkout) {
    const metadata = checkout?.metadata || {};
    if (metadata.purchaseType !== 'ai_credit_pack') return null;
    const email = String(
        metadata.email || checkout?.customer?.email || '',
    ).trim().toLowerCase();
    if (!email) throw validationError('Missing customer email on Creem checkout', 'CREEM_EMAIL_MISSING');

    const pack = resolvePackageFromCheckout(checkout);
    const orderStatus = String(checkout?.order?.status || checkout?.status || '').trim().toLowerCase();
    if (orderStatus && !PAID_ORDER_STATUSES.has(orderStatus)) {
        throw validationError(`Creem order status is not paid (${orderStatus})`, 'CREEM_ORDER_UNPAID');
    }

    const amountPaid = extractAmountCents(checkout);
    if (amountPaid == null) {
        throw validationError('Creem paid amount missing', 'CREEM_AMOUNT_MISSING');
    }
    const currency = extractCurrency(checkout);
    if (currency && currency !== 'USD') {
        throw validationError(`Unsupported Creem currency ${currency}`, 'CREEM_CURRENCY_UNSUPPORTED');
    }

    const metaCredits = Number(metadata.credits);
    if (Number.isFinite(metaCredits) && metaCredits !== pack.credits) {
        throw validationError('Credit quantity metadata does not match server package', 'CREEM_CREDITS_MISMATCH');
    }
    const metaPrice = Number(metadata.priceUsdCents);
    if (Number.isFinite(metaPrice) && metaPrice !== pack.priceUsdCents) {
        throw validationError('Price metadata does not match server package', 'CREEM_PRICE_METADATA_MISMATCH');
    }

    const orderId = checkout?.order?.id || null;
    const checkoutId = checkout?.id || null;
    if (!orderId && !checkoutId && !checkout?.request_id) {
        throw validationError('Creem checkout missing order/checkout identifiers', 'CREEM_REFERENCE_MISSING');
    }
    const referenceId = orderId
        ? `creem_order_${orderId}`
        : `creem_checkout_${checkoutId || checkout.request_id}`;

    if (orderId || checkoutId) {
        await upsertCreemOrder(connection, {
            orderId: orderId || referenceId,
            checkoutId,
            email,
            packageId: pack.id,
            amountCents: amountPaid,
            currency,
            status: 'completed',
            metadata: { checkoutId, requestId: checkout?.request_id, productId: extractProductId(checkout) },
        });
    }

    return fulfillAiCreditPackPurchase(connection, {
        email,
        packageId: pack.id,
        amountPaidCents: amountPaid,
        referenceId,
        provider: 'creem',
        requirePaidAmount: true,
        metadata: {
            creemCheckoutId: checkoutId,
            creemOrderId: orderId,
            requestId: checkout?.request_id,
            productId: extractProductId(checkout),
            currency,
        },
    });
}

async function handleCreemRefundCreated(connection, refundObject) {
    const refundId = refundObject?.id || refundObject?.refund_id || null;
    const orderId = refundObject?.order?.id || refundObject?.order_id || null;
    const checkoutId = refundObject?.checkout?.id || refundObject?.checkout_id || null;
    const candidates = [];
    if (orderId) candidates.push(`creem_order_${orderId}`);
    if (checkoutId) candidates.push(`creem_checkout_${checkoutId}`);
    if (!candidates.length) return null;

    let grant = null;
    let referenceBase = null;
    const foundEntries = await Promise.all(
        candidates.map(async (candidate) => ({
            candidate,
            entry: await findLedgerByReferenceAsync(connection, candidate),
        })),
    );
    for (const { candidate, entry } of foundEntries) {
        if (entry && entry.amount > 0) {
            grant = entry;
            referenceBase = candidate;
            break;
        }
    }
    if (!grant || !referenceBase) return null;

    const packageId = grant.metadata?.packageId;
    const pack = resolvePackConfig(packageId);
    const refundAmount = Number(
        refundObject?.amount
        ?? refundObject?.refund_amount
        ?? refundObject?.order?.amount
        ?? 0,
    );
    const creditsToReverse = pack && Number.isFinite(refundAmount) && refundAmount > 0
        ? Math.min(grant.amount, Math.round((refundAmount / pack.priceUsdCents) * pack.credits))
        : grant.amount;
    if (!Number.isFinite(creditsToReverse) || creditsToReverse <= 0) return null;

    const refundReference = `creem_refund_${refundId || `${orderId || checkoutId}_full`}`;
    if (orderId) {
        await upsertCreemOrder(connection, {
            orderId,
            email: grant.email,
            packageId: packageId || 'unknown',
            status: 'refunded',
            metadata: { refundId, referenceBase, creditsToReverse },
        });
    }
    return reverseCreditsIdempotentAsync(connection, {
        email: grant.email,
        amount: creditsToReverse,
        referenceId: refundReference,
        entryType: 'refund',
        metadata: { orderId, checkoutId, refundId, grantReference: referenceBase },
    });
}

async function handleCreemWebhookEvent(connection, event) {
    const eventType = event?.eventType || event?.type;
    const object = event?.object || event?.data?.object;
    if (eventType === 'checkout.completed') {
        return handleCreemCheckoutCompleted(connection, object);
    }
    if (eventType === 'refund.created') {
        return handleCreemRefundCreated(connection, object);
    }
    return null;
}

const creemWebhook = async (req, res) => {
    const secret = getCreemWebhookSecret();
    const signature = req.headers['creem-signature'];
    const rawBody = normalizeRawBody(req.body);
    if (!secret || !rawBody || !verifyCreemWebhookSignature(rawBody, signature, secret)) {
        return res.status(401).send('Webhook signature verification failed');
    }
    let event;
    try {
        event = JSON.parse(rawBody);
    } catch {
        return res.status(400).send('Invalid webhook payload');
    }
    const eventId = String(event?.id || '').trim();
    if (!eventId) return res.status(400).send('Missing event id');
    const eventType = event?.eventType || event?.type || null;
    const connection = req.app.locals.db;
    const claimed = await claimCreemEvent(connection, eventId, eventType);
    if (!claimed) {
        return res.json({ received: true, duplicate: true });
    }
    try {
        await handleCreemWebhookEvent(connection, event);
        return res.json({ received: true });
    } catch (error) {
        if (error?.permanent) {
            console.error('[CREEM WEBHOOK] permanent reject', error.code || '', error.message);
            return res.json({ received: true, ignored: true, code: error.code || 'CREEM_PAYMENT_INVALID' });
        }
        await releaseCreemEventClaim(connection, eventId);
        console.error('[CREEM WEBHOOK]', error?.message || error);
        return res.status(500).json({ message: 'Webhook handler failed' });
    }
};

module.exports = {
    createAiCreditCreemCheckout,
    creemWebhook,
    getCreemCheckoutStatus,
    handleCreemCheckoutCompleted,
    handleCreemRefundCreated,
    handleCreemWebhookEvent,
};
