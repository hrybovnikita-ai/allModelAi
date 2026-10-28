const crypto = require('crypto');

function normalizeRawBody(rawBody) {
    if (Buffer.isBuffer(rawBody)) return rawBody;
    if (typeof rawBody === 'string') return Buffer.from(rawBody, 'utf8');
    return null;
}

function isHexSignature(value) {
    return /^[a-f0-9]+$/i.test(value) && value.length % 2 === 0 && value.length >= 32;
}

/**
 * Lemon Squeezy sends HMAC-SHA256 hex digest of the raw body in X-Signature.
 * @see https://docs.lemonsqueezy.com/help/webhooks/signing-requests
 */
function verifyLemonSqueezyWebhookSignature(rawBody, signatureHeader, secret) {
    const body = normalizeRawBody(rawBody);
    const signature = String(signatureHeader || '').trim();
    const key = String(secret || '').trim();
    if (!body?.length || !signature || !key || !isHexSignature(signature)) return false;
    const computed = crypto.createHmac('sha256', key).update(body).digest('hex');
    try {
        const a = Buffer.from(computed, 'hex');
        const b = Buffer.from(signature, 'hex');
        if (a.length !== b.length) return false;
        return crypto.timingSafeEqual(a, b);
    } catch {
        return false;
    }
}

module.exports = {
    normalizeRawBody,
    verifyLemonSqueezyWebhookSignature,
};
