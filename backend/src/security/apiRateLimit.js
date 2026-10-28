/**
 * API rate limiting: per-IP (early) and per-user (after auth).
 * Uses Redis via app.locals.cache when available; falls back to in-memory Map.
 */

const { securityWarn } = require('./structuredLog');
const { recordRateLimitHit } = require('../services/rateLimitStats');
const { isPostgresConnection } = require('../db/postgresHttpReads');

const memoryBuckets = new Map();

function parsePositiveInt(value, fallback) {
    const n = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

function clientIp(req) {
    return String(req.ip || req.socket?.remoteAddress || 'unknown').trim();
}

function pruneLocal(key, windowMs, now) {
    const times = (memoryBuckets.get(key) || []).filter((stamp) => now - stamp < windowMs);
    if (times.length) memoryBuckets.set(key, times);
    else memoryBuckets.delete(key);
    return times;
}

async function increment(cache, key, windowMs, now) {
    const ttlSec = Math.max(1, Math.ceil(windowMs / 1000));
    if (cache?.get && cache?.set) {
        try {
            const existing = await cache.get(key);
            const times = Array.isArray(existing)
                ? existing.filter((stamp) => now - stamp < windowMs)
                : [];
            times.push(now);
            await cache.set(key, times, ttlSec);
            return times.length;
        } catch {
            /* fall through to memory */
        }
    }
    const times = pruneLocal(key, windowMs, now);
    times.push(now);
    memoryBuckets.set(key, times);
    return times.length;
}

function rateLimitResponse(res, retryAfterSec, message) {
    res.setHeader('Retry-After', String(retryAfterSec));
    return res.status(429).json({
        code: 'RATE_LIMIT',
        message: message
            || 'This account is sending requests too quickly. Wait a moment, then retry.',
        retryAfterSec,
    });
}

function isPremiumUserEmail(connection, email) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) return false;
    const owners = String(process.env.PAYMENT_OWNER_EMAILS || '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
    if (owners.includes(normalized)) return true;
    try {
        if (isPostgresConnection(connection)) {
            return false;
        }
        const row = connection.database.prepare(`
            SELECT plan, status FROM subscription_details
            WHERE lower(trim(email)) = ? AND status = 'active'
        `).get(normalized);
        if (!row?.plan) return false;
        const plan = String(row.plan).toLowerCase();
        return ['pro', 'starter', 'plus', 'unlimited', 'week', 'common'].includes(plan);
    } catch {
        return false;
    }
}

async function isPremiumUserEmailAsync(connection, email) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) return false;
    const owners = String(process.env.PAYMENT_OWNER_EMAILS || '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
    if (owners.includes(normalized)) return true;
    try {
        if (isPostgresConnection(connection)) {
            const { queryPgPool, resolvePostgresAsyncPool } = require('../db/pgPoolQuery');
            const pool = resolvePostgresAsyncPool(connection);
            const result = await queryPgPool(
                pool,
                `SELECT plan, status FROM subscription_details
                 WHERE lower(trim(email)) = $1 AND status = 'active'`,
                [normalized],
            );
            const row = result.rows[0];
            if (!row?.plan) return false;
            const plan = String(row.plan).toLowerCase();
            return ['pro', 'starter', 'plus', 'unlimited', 'week', 'common'].includes(plan);
        }
        return isPremiumUserEmail(connection, email);
    } catch {
        return false;
    }
}

/**
 * Early IP rate limit for /api (replaces production-only Map in localApp).
 * Enabled in production by default; enable in all envs with ENABLE_API_RATE_LIMIT=true.
 */
function createIpRateLimitMiddleware(options = {}) {
    const windowMs = options.windowMs || parsePositiveInt(process.env.API_RATE_LIMIT_WINDOW_MS, 60_000);
    const chatLimit = options.chatLimit || parsePositiveInt(process.env.API_RATE_LIMIT_CHAT_PER_MIN, 60);
    const apiLimit = options.apiLimit || parsePositiveInt(process.env.API_RATE_LIMIT_API_PER_MIN, 300);
    const enabledByDefault = process.env.NODE_ENV === 'production';
    const enabledFlag = process.env.ENABLE_API_RATE_LIMIT;
    const enabled = enabledFlag === undefined || enabledFlag === ''
        ? enabledByDefault
        : !/^(0|false|no|off)$/i.test(String(enabledFlag).trim());

    return async function ipRateLimitMiddleware(req, res, next) {
        if (!enabled) return next();
        if (process.env.NODE_ENV === 'test' && process.env.ENABLE_API_RATE_LIMIT !== 'true') {
            return next();
        }
        // Admin ops must remain reachable even if a noisy IP is throttled.
        if (String(req.path || '').startsWith('/admin')) {
            return next();
        }

        const isChat = req.path === '/chat' || req.path.startsWith('/chat/');
        const limit = isChat ? chatLimit : apiLimit;
        const bucket = isChat ? 'chat' : 'api';
        const key = `rl:ip:${clientIp(req)}:${bucket}`;
        const now = Date.now();
        const cache = req.app?.locals?.cache;
        const count = await increment(cache, key, windowMs, now);
        if (count > limit) {
            recordRateLimitHit({ kind: 'ip', scope: clientIp(req), path: req.path });
            securityWarn('rate_limit_ip', {
                ip: clientIp(req),
                bucket,
                count,
                limit,
                path: req.path,
            });
            return rateLimitResponse(res, Math.ceil(windowMs / 1000));
        }
        return next();
    };
}

/**
 * Per-authenticated-user limit for expensive routes (chat, images, research).
 * Mount after requireAuth.
 */
function createUserRateLimitMiddleware(options = {}) {
    const windowMs = options.windowMs || parsePositiveInt(process.env.USER_RATE_LIMIT_WINDOW_MS, 60_000);
    const freeLimit = options.limit || parsePositiveInt(process.env.USER_RATE_LIMIT_PER_MIN, 40);
    const premiumLimit = parsePositiveInt(process.env.USER_RATE_LIMIT_PREMIUM_PER_MIN, Math.max(freeLimit * 2, 120));
    const scope = options.scope || 'expensive';

    return async function userRateLimitMiddleware(req, res, next) {
        if (process.env.ENABLE_USER_RATE_LIMIT === 'false') return next();
        if (process.env.NODE_ENV === 'test' && process.env.ENABLE_USER_RATE_LIMIT !== 'true') {
            return next();
        }
        const email = String(req.user?.email || '').trim().toLowerCase();
        if (!email) return next();

        const connection = req.app?.locals?.db;
        const premium = await isPremiumUserEmailAsync(connection, email);
        const limit = premium ? premiumLimit : freeLimit;

        const key = `rl:user:${email}:${scope}`;
        const now = Date.now();
        const cache = req.app?.locals?.cache;
        const count = await increment(cache, key, windowMs, now);
        if (count > limit) {
            recordRateLimitHit({ kind: 'user', scope: email, path: req.path });
            securityWarn('rate_limit_user', {
                email,
                scope,
                count,
                limit,
                premium,
                path: req.path,
            });
            return rateLimitResponse(
                res,
                Math.ceil(windowMs / 1000),
                'You are sending AI requests too quickly. Wait a moment, then retry.',
            );
        }
        return next();
    };
}

/** Test helper: clear in-memory buckets (and optionally app cache rl: keys). */
async function resetRateLimitMemory(cache) {
    memoryBuckets.clear();
    if (cache?.flushPrefix) {
        await cache.flushPrefix('rl:');
    }
}

module.exports = {
    createIpRateLimitMiddleware,
    createUserRateLimitMiddleware,
    resetRateLimitMemory,
    clientIp,
};
