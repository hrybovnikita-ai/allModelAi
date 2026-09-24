const FORBIDDEN_LOG_KEYS = new Set([
    'password',
    'passwordHash',
    'password_hash',
    'token',
    'cookie',
    'cookies',
    'authorization',
    'apiKey',
]);

function normalizeEmail(email) {
    if (typeof email !== 'string') return '';
    return email.trim().toLowerCase();
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function authLog(message, meta = {}) {
    if (process.env.NODE_ENV === 'test') return;
    const safeMeta = Object.fromEntries(
        Object.entries(meta).filter(([key]) => !FORBIDDEN_LOG_KEYS.has(key))
    );
    if (Object.keys(safeMeta).length) {
        console.log(`[AUTH] ${message}`, safeMeta);
    } else {
        console.log(`[AUTH] ${message}`);
    }
}

function allowLoginAutoRegister() {
    if (process.env.DISABLE_LOGIN_AUTO_REGISTER === 'true') return false;
    return process.env.NODE_ENV !== 'production';
}

module.exports = {
    authLog,
    normalizeEmail,
    isValidEmail,
    allowLoginAutoRegister,
};
