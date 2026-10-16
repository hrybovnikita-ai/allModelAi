/**
 * Automatic AI Fallback policy — extends Smart Router 2.0.
 * Opt-in via FEATURE_AI_FALLBACK / request fallbackEnabled.
 * Does not retry authentication or invalid-request failures blindly.
 * Never silently upgrades free-tier slugs to paid providers.
 */

const {
    MAX_RUNTIME_FALLBACKS,
    ERROR_CATEGORIES,
    categorizeHttpStatus,
    categorizeFetchError,
    shouldTryFallback,
} = require('./smartRouter2/fallbacks');
const { parseEnvBoolean } = require('../platform/featureRegistry');
const { securityLog } = require('../security/structuredLog');

/** Free-tier chat slugs that must not auto-failover onto paid gateways. */
const FREE_TIER_SLUGS = new Set([
    'gemini',
    'cloudflare',
    'gpt-oss',
    'nemotron',
    'deepseek-r1',
]);

/**
 * Machine-readable codes for SSE / API clients (stable contract).
 * Categories come from smartRouter2/fallbacks ERROR_CATEGORIES values.
 */
const FALLBACK_CODES = Object.freeze({
    authentication: 'FALLBACK_AUTH_BLOCKED',
    invalid_request: 'FALLBACK_INVALID_BLOCKED',
    rate_limit: 'FALLBACK_RATE_LIMIT',
    timeout: 'FALLBACK_TIMEOUT',
    unavailable_model: 'FALLBACK_UNAVAILABLE',
    server_error: 'FALLBACK_UPSTREAM',
    network: 'FALLBACK_NETWORK',
    unknown: 'FALLBACK_UNKNOWN',
    loop_prevented: 'FALLBACK_LOOP_PREVENTED',
    free_to_paid_blocked: 'FALLBACK_FREE_TO_PAID_BLOCKED',
    candidates_exhausted: 'FALLBACK_CANDIDATES_EXHAUSTED',
    budget_blocked: 'FALLBACK_BUDGET_BLOCKED',
});

function isFallbackFeatureEnabled() {
    return parseEnvBoolean('FEATURE_AI_FALLBACK', true);
}

function parsePositiveInt(value, fallback) {
    const n = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

function maxFallbackAttempts() {
    return parsePositiveInt(process.env.AI_FALLBACK_MAX_ATTEMPTS, MAX_RUNTIME_FALLBACKS);
}

function backoffBaseMs() {
    return parsePositiveInt(process.env.AI_FALLBACK_BACKOFF_MS, 250);
}

function computeBackoffMs(attemptIndex) {
    const base = backoffBaseMs();
    const capped = Math.min(base * (2 ** Math.max(0, attemptIndex)), 8_000);
    const jitter = Math.floor(Math.random() * Math.min(100, base));
    return capped + jitter;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isFreeTierSlug(slug) {
    return FREE_TIER_SLUGS.has(String(slug || '').trim().toLowerCase());
}

function fallbackCodeForCategory(category) {
    const key = String(category || '').trim().toLowerCase() || 'unknown';
    return FALLBACK_CODES[key] || FALLBACK_CODES.unknown;
}

/**
 * Decide whether a failed upstream response may trigger cross-model fallback.
 */
function classifyFailure({ status, detail, error } = {}) {
    if (error && !status) {
        return categorizeFetchError(error);
    }
    // Explicit auth/validation statuses take precedence over provider wording.
    if ([401, 403, 400, 422].includes(status)) return categorizeHttpStatus(status);
    const text = String(detail || '').toLowerCase();
    if (status === 400 || /invalid[_\s-]?request|bad request|unsupported|malformed/i.test(text)) {
        return ERROR_CATEGORIES.invalid || 'invalid_request';
    }
    if (/insufficient.*(balance|credit|quota)|quota.*exceeded|billing/i.test(text)) {
        return ERROR_CATEGORIES.rate_limit;
    }
    return categorizeHttpStatus(status);
}

function mayAttemptFallback(category) {
    return shouldTryFallback(category);
}

/**
 * Build an ordered candidate list without duplicates or cycles.
 * When blockPaidForFreeRequest is set, free-tier origins never receive paid candidates.
 */
function selectFallbackCandidates({
    requestedSlug,
    preferredChain = [],
    modelAllowed = () => true,
    visited = new Set(),
    maxAttempts = maxFallbackAttempts(),
    blockPaidForFreeRequest = true,
} = {}) {
    const seen = new Set(
        [...visited].map((item) => String(item || '').toLowerCase()).filter(Boolean),
    );
    const requested = String(requestedSlug || '').toLowerCase();
    if (requested) seen.add(requested);
    const blockPaid = blockPaidForFreeRequest && isFreeTierSlug(requested);

    const out = [];
    for (const candidate of preferredChain) {
        const slug = String(candidate || '').trim().toLowerCase();
        if (!slug || seen.has(slug)) continue;
        if (typeof modelAllowed === 'function' && !modelAllowed(slug)) continue;
        if (blockPaid && !isFreeTierSlug(slug)) continue;
        seen.add(slug);
        out.push(slug);
        if (out.length >= maxAttempts) break;
    }
    return out;
}

function buildFallbackNotice({ requestedModel, actualModel, category, code } = {}) {
    const from = requestedModel || 'preferred model';
    const to = actualModel || 'an available model';
    const reason = category && category !== 'unknown'
        ? ` (${String(category).replace(/_/g, ' ')})`
        : '';
    const codeSuffix = code ? ` [${code}]` : '';
    return `Answered with ${to} after ${from} was unavailable${reason}.${codeSuffix}`.replace(/\.\./g, '.');
}

function createFallbackTracker({ requestedSlug } = {}) {
    const visited = new Set(
        requestedSlug ? [String(requestedSlug).toLowerCase()] : [],
    );
    const events = [];
    let attempts = 0;

    return {
        visited,
        events,
        get attempts() {
            return attempts;
        },
        canAttempt() {
            return attempts < maxFallbackAttempts();
        },
        markVisited(slug) {
            if (slug) visited.add(String(slug).toLowerCase());
        },
        record({ from, to, category, latencyMs, success, code }) {
            attempts += 1;
            const resolvedCode = code || fallbackCodeForCategory(category);
            const event = {
                from: from || null,
                to: to || null,
                category: category || null,
                code: resolvedCode,
                latencyMs: latencyMs == null ? null : Number(latencyMs),
                success: Boolean(success),
                at: new Date().toISOString(),
            };
            events.push(event);
            if (to) visited.add(String(to).toLowerCase());
            securityLog('ai_fallback', event);
            return event;
        },
    };
}

/**
 * Run fallback attempts with exponential backoff and loop prevention.
 * attemptFn(candidate) should return { ok: boolean, ... }.
 */
async function runFallbackChain({
    candidates,
    tracker,
    category,
    from,
    attemptFn,
    onBackoff,
} = {}) {
    if (!Array.isArray(candidates) || !candidates.length || typeof attemptFn !== 'function') {
        return { ok: false, candidate: null };
    }
    const activeTracker = tracker || createFallbackTracker({ requestedSlug: from });
    let index = 0;
    for (const candidate of candidates) {
        if (!activeTracker.canAttempt()) break;
        if (activeTracker.visited.has(String(candidate).toLowerCase())) continue;
        const waitMs = computeBackoffMs(index);
        if (waitMs > 0) {
            if (typeof onBackoff === 'function') onBackoff({ candidate, waitMs, attempt: index });
            await sleep(waitMs);
        }
        const started = Date.now();
        let result;
        try {
            result = await attemptFn(candidate, { attempt: index, category });
        } catch (error) {
            activeTracker.record({
                from,
                to: candidate,
                category: categorizeFetchError(error),
                latencyMs: Date.now() - started,
                success: false,
            });
            index += 1;
            continue;
        }
        const ok = Boolean(result?.ok);
        activeTracker.record({
            from,
            to: candidate,
            category,
            latencyMs: Date.now() - started,
            success: ok,
        });
        if (ok) {
            return { ok: true, candidate, result, tracker: activeTracker };
        }
        index += 1;
    }
    return { ok: false, candidate: null, tracker: activeTracker };
}

module.exports = {
    FALLBACK_CODES,
    FREE_TIER_SLUGS,
    isFallbackFeatureEnabled,
    isFreeTierSlug,
    fallbackCodeForCategory,
    maxFallbackAttempts,
    computeBackoffMs,
    sleep,
    classifyFailure,
    mayAttemptFallback,
    selectFallbackCandidates,
    buildFallbackNotice,
    createFallbackTracker,
    runFallbackChain,
    ERROR_CATEGORIES,
};
