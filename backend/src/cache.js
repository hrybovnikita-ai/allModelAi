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
                try {
                    const value = await bounded(redis.get(key));
                    if (value !== null) {
                        try {
                            return JSON.parse(value);
                        } catch {
                            return null;
                        }
                    }
                } catch { /* fallback */ }
            }
            const entry = memory.get(key);
            if (entry && entry.expires > now()) {
                try {
                    return JSON.parse(entry.value);
                } catch {
                    memory.delete(key);
                    return null;
                }
            }
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
const CACHE_MIDDLEWARE_TIMEOUT_MS = Number(process.env.CACHE_MIDDLEWARE_TIMEOUT_MS || 500);

// Use only for public responses that are identical for every visitor.
function cachePublicResponse(key, ttl = 30) {
    return async (req, res, next) => {
        let forwarded = false;
        const forward = () => {
            if (forwarded || res.headersSent) return;
            forwarded = true;
            next();
        };
        try {
            await Promise.race([
                (async () => {
                    const cache = req.app.locals.cache;
                    const cached = await cache.get(key);
                    if (res.headersSent) return;
                    res.setHeader('X-Cache', cached === null ? 'MISS' : 'HIT');
                    if (cached !== null) {
                        forwarded = true;
                        res.json(cached);
                        return;
                    }
                    const json = res.json.bind(res);
                    res.json = (body) => {
                        if (res.statusCode === 200) {
                            const emptyCommunityList =
                                key.includes('community-users')
                                && Array.isArray(body?.users)
                                && body.users.length === 0;
                            if (!emptyCommunityList) {
                                void cache.set(key, body, ttl);
                            }
                        }
                        return json(body);
                    };
                    forward();
                })(),
                new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Cache middleware timeout')), CACHE_MIDDLEWARE_TIMEOUT_MS);
                }),
            ]);
        } catch {
            forward();
        }
    };
}
module.exports = { createCache, cachePublicResponse };
