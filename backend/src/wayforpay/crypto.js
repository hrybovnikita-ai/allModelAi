const crypto = require('node:crypto');

const PURCHASE_SIGNATURE_KEYS = [
    'merchantAccount',
    'merchantDomainName',
    'orderReference',
    'orderDate',
    'amount',
    'currency',
    'productName',
    'productCount',
    'productPrice',
];

const CALLBACK_SIGNATURE_KEYS = [
    'merchantAccount',
    'orderReference',
    'amount',
    'currency',
    'authCode',
    'cardPan',
    'transactionStatus',
    'reasonCode',
];

const joinSignatureParts = (payload, keys) => {
    const parts = [];
    for (const key of keys) {
        if (!(key in payload)) continue;
        const value = payload[key];
        if (Array.isArray(value)) {
            for (const item of value) parts.push(String(item));
        } else {
            parts.push(String(value));
        }
    }
    return parts.join(';');
};

const hmacMd5 = (message, secretKey) => crypto
    .createHmac('md5', secretKey)
    .update(message, 'utf8')
    .digest('hex');

const signPurchaseRequest = (payload, secretKey) => hmacMd5(
    joinSignatureParts(payload, PURCHASE_SIGNATURE_KEYS),
    secretKey,
);

const signCallbackPayload = (payload, secretKey) => hmacMd5(
    joinSignatureParts(payload, CALLBACK_SIGNATURE_KEYS),
    secretKey,
);

const verifyCallbackSignature = (payload, secretKey) => {
    const expected = payload.merchantSignature;
    if (!expected) return false;
    const calculated = hmacMd5(
        joinSignatureParts(payload, CALLBACK_SIGNATURE_KEYS),
        secretKey,
    );
    const a = Buffer.from(calculated, 'utf8');
    const b = Buffer.from(String(expected), 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
};

const buildCallbackAcceptResponse = (orderReference, secretKey) => {
    const time = Math.floor(Date.now() / 1000);
    const status = 'accept';
    const signature = hmacMd5(`${orderReference};${status};${time}`, secretKey);
    return { orderReference, status, time, signature };
};

module.exports = {
    signPurchaseRequest,
    signCallbackPayload,
    verifyCallbackSignature,
    buildCallbackAcceptResponse,
    joinSignatureParts,
    PURCHASE_SIGNATURE_KEYS,
    CALLBACK_SIGNATURE_KEYS,
};
