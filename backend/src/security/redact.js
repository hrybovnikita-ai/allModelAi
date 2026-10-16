/**
 * Central secret redaction for logs and error payloads.
 * Never send provider keys, JWTs, or payment secrets to clients or unstructured logs.
 */

const SECRET_PATTERNS = [
    [/sk-[A-Za-z0-9_-]{8,}/g, '[redacted]'],
    [/sk_[A-Za-z0-9]+/g, '[redacted]'],
    [/amai_[A-Za-z0-9_-]+/gi, '[redacted-api-key]'],
    [/Bearer\s+\S+/gi, 'Bearer [redacted]'],
    [/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted-jwt]'],
    [/postgres(?:ql)?:\/\/[^\s'"]+/gi, '[redacted-connection-uri]'],
    [/(password=)[^\s&'"]+/gi, '$1[redacted]'],
    [/(Password:\s*)[^\s'"]+/gi, '$1[redacted]'],
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[redacted-private-key]'],
    [/AIza[0-9A-Za-z_-]{20,}/g, '[redacted]'],
    [/xox[baprs]-[A-Za-z0-9-]+/g, '[redacted]'],
];

const REDACT_KEYS = new Set([
    'password',
    'passwordhash',
    'password_hash',
    'secret',
    'secretkey',
    'merchantsecretkey',
    'merchantpassword',
    'apikey',
    'api_key',
    'authorization',
    'token',
    'accesstoken',
    'access_token',
    'refreshtoken',
    'refresh_token',
    'privatekey',
    'private_key',
    'cardpan',
    'cvv',
    'cvc',
    'client_secret',
    'clientsecret',
]);

function redactSecrets(value) {
    let text = String(value == null ? '' : value);
    for (const [pattern, replacement] of SECRET_PATTERNS) {
        text = text.replace(pattern, replacement);
    }
    return text;
}

function redactObject(value, depth = 0) {
    if (value == null || typeof value !== 'object' || depth > 8) {
        if (typeof value === 'string') return redactSecrets(value);
        return value;
    }
    if (Array.isArray(value)) {
        return value.map((item) => redactObject(item, depth + 1));
    }
    return Object.fromEntries(
        Object.entries(value).map(([key, item]) => {
            const normalized = String(key).toLowerCase().replace(/[^a-z0-9_]/g, '');
            if (REDACT_KEYS.has(normalized) || REDACT_KEYS.has(String(key).toLowerCase())) {
                return [key, '[redacted]'];
            }
            if (String(key).toLowerCase().includes('signature') && typeof item === 'string' && item.length > 12) {
                return [key, `${item.slice(0, 8)}…`];
            }
            return [key, redactObject(item, depth + 1)];
        }),
    );
}

function safeErrorMessage(error, fallback = 'An unexpected error occurred') {
    const raw = error?.message || fallback;
    return redactSecrets(String(raw)).slice(0, 500);
}

module.exports = {
    redactSecrets,
    redactObject,
    safeErrorMessage,
    REDACT_KEYS,
};
