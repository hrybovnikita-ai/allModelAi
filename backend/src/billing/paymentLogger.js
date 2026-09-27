const REDACT_KEYS = new Set([
    'secretkey',
    'merchantsecretkey',
    'merchantpassword',
    'password',
    'cardpan',
    'cvv',
    'cvc',
]);

const sanitize = (value) => {
    if (value == null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(sanitize);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
        if (REDACT_KEYS.has(String(key).toLowerCase())) return [key, '[redacted]'];
        if (String(key).toLowerCase().includes('signature') && typeof item === 'string' && item.length > 12) {
            return [key, `${item.slice(0, 8)}…`];
        }
        return [key, sanitize(item)];
    }));
};

const logPayment = (message, details = {}) => {
    if (process.env.NODE_ENV === 'test') return;
    const payload = Object.keys(details).length ? sanitize(details) : undefined;
    if (payload) console.log(`[PAYMENT] ${message}`, payload);
    else console.log(`[PAYMENT] ${message}`);
};

const logSubscription = (message, details = {}) => {
    if (process.env.NODE_ENV === 'test') return;
    const payload = Object.keys(details).length ? sanitize(details) : undefined;
    if (payload) console.log(`[SUBSCRIPTION] ${message}`, payload);
    else console.log(`[SUBSCRIPTION] ${message}`);
};

module.exports = { logPayment, logSubscription, sanitize };
