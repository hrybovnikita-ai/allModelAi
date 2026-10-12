const modelVariants = require('../data/modelVariants.json');
const { authLog } = require('../authHelpers');
const { providerAvailabilityForRouter, buildProviderSnapshot } = require('../providerHealth');
const { resolveImageProvider } = require('../pollinations');

const TTL_MS = Number(process.env.MODEL_STATUS_CACHE_TTL_MS || 30_000);

/** @type {{ body: object | null, expiresAt: number }} */
let memoryCache = { body: null, expiresAt: 0 };

function buildModelStatusPayload() {
    const availability = providerAvailabilityForRouter();
    const image = resolveImageProvider();
    const providers = buildProviderSnapshot();
    return {
        updatedAt: new Date().toISOString(),
        variants: modelVariants,
        imageGeneration: {
            provider: image.provider,
            configured: image.provider !== 'none',
            pollinations: image.provider === 'pollinations',
        },
        models: {
            ...availability,
            cloudflare: Boolean(
                ((process.env.CLOUDFLARE_API_KEY || process.env.CLAUDEFLARE_API_KEY) && process.env.CLOUDFLARE_ACCOUNT_ID)
                || availability.others,
            ),
        },
        providers,
    };
}

/**
 * Public model status is built from env configuration only (no live provider probes).
 * Synchronous in-memory cache keeps the handler off async Redis middleware and the event loop.
 */
function getPublicModelStatus({ forceRefresh = false } = {}) {
    const started = Date.now();
    const now = Date.now();
    if (!forceRefresh && memoryCache.body && memoryCache.expiresAt > now) {
        authLog('MODELS_STATUS_CACHE_HIT', { ageMs: now - (memoryCache.expiresAt - TTL_MS), durationMs: Date.now() - started });
        return { body: memoryCache.body, cacheHit: true };
    }
    const body = buildModelStatusPayload();
    memoryCache = { body, expiresAt: now + TTL_MS };
    authLog('MODELS_STATUS_CACHE_MISS', { durationMs: Date.now() - started });
    return { body, cacheHit: false };
}

/** @internal Tests only */
function resetModelStatusCacheForTests() {
    memoryCache = { body: null, expiresAt: 0 };
}

module.exports = {
    buildModelStatusPayload,
    getPublicModelStatus,
    resetModelStatusCacheForTests,
};
