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

function isNonProductionRuntime() {
    if (process.env.VERCEL) return false;
    return process.env.NODE_ENV !== 'production';
}

function allowLoginAutoRegister() {
    if (process.env.DISABLE_LOGIN_AUTO_REGISTER === 'true') return false;
    return isNonProductionRuntime();
}

/** Local/dev server only — never enabled in production or automated tests. */
function allowDevPasswordBypass() {
    if (process.env.DISABLE_DEV_PASSWORD_BYPASS === 'true') return false;
    if (process.env.ALLOW_ANY_PASSWORD === 'false') return false;
    if (process.env.NODE_ENV === 'test') return false;
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL) return false;
    if (process.env.ALLOW_ANY_PASSWORD === 'true') return true;
    return isNonProductionRuntime();
}

function defaultLoginName(normalizedEmail, name) {
    if (typeof name === 'string' && name.trim()) return name.trim();
    if (normalizedEmail === 'hrybovnikita@gmail.com') return 'Nikita Hrybov';
    return normalizedEmail.split('@')[0];
}

/** True when `node server.js` local dev should auto-provision users and skip password checks. */
function isLocalDevLogin() {
    return allowLoginAutoRegister() && allowDevPasswordBypass();
}

module.exports = {
    authLog,
    normalizeEmail,
    isValidEmail,
    allowLoginAutoRegister,
    allowDevPasswordBypass,
    defaultLoginName,
    isLocalDevLogin,
};
