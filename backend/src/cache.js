const { createClient } = require('redis');
function createCache({ url = process.env.REDIS_URL, client, now = Date.now } = {}) {
    const memory = new Map();
    const redis = client || (url ? createClient({ url, disableOfflineQueue: true,
        socket: { connectTimeout: 1000, reconnectStrategy: (attempt) => Math.min(500 * (attempt + 1), 10000) },
    }) : null);
    if (redis && !client) {
        redis.on('error', () => {}); // Cache outages use the local fallback.
        redis.connect().catch(() => {});
    }
    async function bounded(operation) {
        let timer;
        try {
            return await Promise.race([operation, new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error('Cache timeout')), 250);
            })]);
        } finally { clearTimeout(timer); }
    }
    return {
        async get(key) {
            if (redis?.isReady) {
                try { const value = await bounded(redis.get(key)); if (value !== null) return JSON.parse(value); } catch { /* fallback */ }
            }
            const entry = memory.get(key);
            if (entry && entry.expires > now()) return JSON.parse(entry.value);
            memory.delete(key);
            return null;
        },
        async set(key, value, ttl = 30) {
            if (memory.size >= 100) memory.delete(memory.keys().next().value);
            const serialized = JSON.stringify(value);
            memory.set(key, { value: serialized, expires: now() + ttl * 1000 });
            if (redis?.isReady) {
                try { await bounded(redis.set(key, serialized, { EX: ttl })); } catch { /* fallback */ }
            }
        },
        async close() { memory.clear(); if (redis?.isOpen) redis.destroy(); },
    };
}
// Use only for public responses that are identical for every visitor.
function cachePublicResponse(key, ttl = 30) {
    return async (req, res, next) => {
        const cache = req.app.locals.cache;
        const cached = await cache.get(key);
        res.setHeader('X-Cache', cached === null ? 'MISS' : 'HIT');
        if (cached !== null) return res.json(cached);
        const json = res.json.bind(res);
        res.json = (body) => {
            if (res.statusCode === 200) void cache.set(key, body, ttl);
            return json(body);
        };
        return next();
    };
}
module.exports = { createCache, cachePublicResponse };
