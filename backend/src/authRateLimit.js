const { normalizeLoginEmail } = require('./authHelpers');

const buckets = new Map();

function prune(key, windowMs, now) {
    const times = (buckets.get(key) || []).filter((stamp) => now - stamp < windowMs);
    if (times.length) buckets.set(key, times);
    else buckets.delete(key);
    return times;
}

function recordAttempt(key, windowMs, now) {
    const times = prune(key, windowMs, now);
    times.push(now);
    buckets.set(key, times);
    return times.length;
}

function clientIp(req) {
    return String(req.ip || req.socket?.remoteAddress || 'unknown').trim();
}

/**
 * Lightweight in-memory rate limit for auth endpoints (per process).
 */
function authAttemptRateLimit(scope, { limit = 40, windowMs = 15 * 60 * 1000, emailScoped = false } = {}) {
    return (req, res, next) => {
        const now = Date.now();
        const ipKey = `${scope}:ip:${clientIp(req)}`;
        const ipCount = recordAttempt(ipKey, windowMs, now);
        if (ipCount > limit) {
            res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
            return res.status(429).json({
                code: 'AUTH_RATE_LIMIT',
                message: 'Too many attempts. Please wait a few minutes and try again.',
            });
        }

        if (emailScoped) {
            const email = normalizeLoginEmail(req.body?.email);
            if (email) {
                const emailKey = `${scope}:email:${email}`;
                const emailLimit = Math.min(limit, 12);
                const emailCount = recordAttempt(emailKey, windowMs, now);
                if (emailCount > emailLimit) {
                    res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
                    return res.status(429).json({
                        code: 'AUTH_RATE_LIMIT',
                        message: 'Too many attempts for this email. Please wait a few minutes and try again.',
                    });
                }
            }
        }

        return next();
    };
}

module.exports = {
    authAttemptRateLimit,
};
