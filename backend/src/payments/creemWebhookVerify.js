const crypto = require('crypto');

function normalizeRawBody(rawBody) {
    if (Buffer.isBuffer(rawBody)) return rawBody.toString('utf8');
    if (typeof rawBody === 'string') return rawBody;
    return null;
}

function isHexSignature(value) {
    return /^[a-f0-9]+$/i.test(value) && value.length % 2 === 0 && value.length >= 32;
}

/**
 * Verify Creem `creem-signature` header (HMAC-SHA256 hex of raw body).
 * Docs: https://docs.creem.io/code/webhooks
 */
function verifyCreemWebhookSignature(rawBody, signatureHeader, secret) {
    const body = normalizeRawBody(rawBody);
    const signature = String(signatureHeader || '').trim().replace(/^sha256=/i, '');
    const key = String(secret || '').trim();
    if (!body || !signature || !key || !isHexSignature(signature)) return false;
    const computed = crypto.createHmac('sha256', key).update(body, 'utf8').digest('hex');
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
    isHexSignature,
    normalizeRawBody,
    verifyCreemWebhookSignature,
};
