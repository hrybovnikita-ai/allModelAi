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

const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 100;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 1024;

function parseRememberMe(value) {
    if (value === false || value === 'false' || value === 0 || value === '0') return false;
    return true;
}

function validateRegistrationInput({ name, email, password }) {
    if (typeof name !== 'string' || !name.trim()) {
        return { ok: false, status: 400, message: 'Please enter your name.' };
    }
    const trimmedName = name.trim();
    if (trimmedName.length < MIN_NAME_LENGTH || trimmedName.length > MAX_NAME_LENGTH) {
        return { ok: false, status: 400, message: `Name must be between ${MIN_NAME_LENGTH} and ${MAX_NAME_LENGTH} characters.` };
    }
    if (typeof email !== 'string' || !email.trim()) {
        return { ok: false, status: 400, message: 'Please enter your email address.' };
    }
    if (email.length > 254) {
        return { ok: false, status: 400, message: 'Please enter a valid email address.' };
    }
    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) {
        return { ok: false, status: 400, message: 'Please enter a valid email address.' };
    }
    if (typeof password !== 'string' || !password) {
        return { ok: false, status: 400, message: 'Please enter a password.' };
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
        return { ok: false, status: 400, message: `Password must contain at least ${MIN_PASSWORD_LENGTH} characters.` };
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
        return { ok: false, status: 400, message: 'Password is too long.' };
    }
    return { ok: true, name: trimmedName, email: normalizedEmail, password };
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
    MIN_PASSWORD_LENGTH,
    validateRegistrationInput,
    parseRememberMe,
};
