/**
 * In-process circuit breaker for AI providers.
 * States: closed (healthy) → open (fail-fast) → half_open (probe).
 * Does not permanently ban a provider after a single error.
 */

const DEFAULTS = {
    failureThreshold: Number(process.env.PROVIDER_CB_FAILURE_THRESHOLD || 5),
    successThreshold: Number(process.env.PROVIDER_CB_SUCCESS_THRESHOLD || 2),
    openMs: Number(process.env.PROVIDER_CB_OPEN_MS || 60_000),
    halfOpenMaxProbes: Number(process.env.PROVIDER_CB_HALF_OPEN_PROBES || 1),
};

/** @type {Map<string, BreakerRow>} */
const breakers = new Map();

/**
 * @typedef {object} BreakerRow
 * @property {'closed'|'open'|'half_open'} state
 * @property {number} consecutiveFailures
 * @property {number} consecutiveSuccesses
 * @property {number} openedAt
 * @property {number} halfOpenProbes
 * @property {string|null} lastErrorClass
 * @property {number} updatedAt
 */

function normalizeProviderId(raw) {
    const id = String(raw || '').trim().toLowerCase();
    if (!id) return 'unknown';
    if (id === 'gpt' || id === 'chatgpt' || id === 'open_ai') return 'openai';
    if (id === 'anthropic') return 'claude';
    if (id === 'google') return 'gemini';
    if (id === 'xai') return 'grok';
    return id;
}

function getRow(providerId) {
    const id = normalizeProviderId(providerId);
    let row = breakers.get(id);
    if (!row) {
        row = {
            state: 'closed',
            consecutiveFailures: 0,
            consecutiveSuccesses: 0,
            openedAt: 0,
            halfOpenProbes: 0,
            lastErrorClass: null,
            updatedAt: Date.now(),
        };
        breakers.set(id, row);
    }
    return row;
}

function maybeTransitionFromOpen(row, now = Date.now()) {
    if (row.state !== 'open') return;
    if (now - row.openedAt >= DEFAULTS.openMs) {
        row.state = 'half_open';
        row.halfOpenProbes = 0;
        row.consecutiveSuccesses = 0;
        row.updatedAt = now;
    }
}

/** Whether a new outbound request may be attempted. */
function canAttempt(providerId) {
    const row = getRow(providerId);
    const now = Date.now();
    maybeTransitionFromOpen(row, now);
    if (row.state === 'closed') return true;
    if (row.state === 'open') return false;
    // half_open: allow limited probes
    return row.halfOpenProbes < DEFAULTS.halfOpenMaxProbes;
}

function recordSuccess(providerId) {
    const row = getRow(providerId);
    const now = Date.now();
    maybeTransitionFromOpen(row, now);
    row.updatedAt = now;
    row.lastErrorClass = null;
    row.consecutiveFailures = 0;
    if (row.state === 'half_open') {
        row.consecutiveSuccesses += 1;
        row.halfOpenProbes += 1;
        if (row.consecutiveSuccesses >= DEFAULTS.successThreshold) {
            row.state = 'closed';
            row.halfOpenProbes = 0;
            row.consecutiveSuccesses = 0;
        }
        return snapshot(providerId);
    }
    row.state = 'closed';
    row.consecutiveSuccesses = 0;
    return snapshot(providerId);
}

/**
 * Auth / missing-key failures should not trip the breaker (not an outage).
 * Rate-limit / timeout / 5xx / network do trip after threshold.
 */
function shouldTripForErrorClass(errorClass) {
    const cls = String(errorClass || '').toLowerCase();
    if (!cls) return true;
    if (cls.includes('auth') || cls.includes('missing') || cls.includes('not_configured')) return false;
    if (cls.includes('quota') || cls.includes('billing') || cls.includes('credits')) return false;
    return true;
}

function recordFailure(providerId, { errorClass = null } = {}) {
    const row = getRow(providerId);
    const now = Date.now();
    maybeTransitionFromOpen(row, now);
    row.updatedAt = now;
    row.lastErrorClass = errorClass ? String(errorClass).slice(0, 64) : row.lastErrorClass;
    row.consecutiveSuccesses = 0;

    if (!shouldTripForErrorClass(errorClass)) {
        return snapshot(providerId);
    }

    if (row.state === 'half_open') {
        row.state = 'open';
        row.openedAt = now;
        row.halfOpenProbes = 0;
        row.consecutiveFailures += 1;
        return snapshot(providerId);
    }

    row.consecutiveFailures += 1;
    if (row.consecutiveFailures >= DEFAULTS.failureThreshold) {
        row.state = 'open';
        row.openedAt = now;
    }
    return snapshot(providerId);
}

function snapshot(providerId) {
    const row = getRow(providerId);
    maybeTransitionFromOpen(row);
    return {
        providerId: normalizeProviderId(providerId),
        state: row.state,
        consecutiveFailures: row.consecutiveFailures,
        consecutiveSuccesses: row.consecutiveSuccesses,
        lastErrorClass: row.lastErrorClass,
        openedAt: row.openedAt || null,
        openMs: DEFAULTS.openMs,
        updatedAt: row.updatedAt,
        canAttempt: canAttempt(providerId),
    };
}

function listBreakerStates() {
    return [...breakers.keys()].map((id) => snapshot(id));
}

/** Test helper */
function resetCircuitBreakersForTests() {
    breakers.clear();
}

module.exports = {
    canAttempt,
    recordSuccess,
    recordFailure,
    snapshot,
    listBreakerStates,
    resetCircuitBreakersForTests,
    normalizeProviderId,
};
