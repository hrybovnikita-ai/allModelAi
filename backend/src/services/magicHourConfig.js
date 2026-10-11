const strip = (value) => String(value || '').trim().replace(/^["']|["']$/g, '');

function normalizeMagicHourKey(raw) {
    if (!raw) return '';
    return String(raw).replace(/\s+/g, '');
}

/** Ordered candidates — first listed wins until auth probe selects a working key. */
function listMagicHourKeyCandidates() {
    const entries = [
        ['MAGIC_HOUR_API_KEY', normalizeMagicHourKey(strip(process.env.MAGIC_HOUR_API_KEY))],
        ['AllModelAi_API_KEY_VIDEO', normalizeMagicHourKey(strip(process.env.AllModelAi_API_KEY_VIDEO))],
        ['MAGIC_CHOUR_API_KEY', normalizeMagicHourKey(strip(process.env.MAGIC_CHOUR_API_KEY))],
    ];
    const seen = new Set();
    const out = [];
    for (const [source, key] of entries) {
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push({ source, key });
    }
    return out;
}

let resolvedKeyCache = null;

function setResolvedMagicHourKey(source, key) {
    if (!source || !key) {
        resolvedKeyCache = null;
        return;
    }
    resolvedKeyCache = { source, key };
}

function clearResolvedMagicHourKeyCache() {
    resolvedKeyCache = null;
}

function getMagicHourApiKey() {
    if (resolvedKeyCache?.key) return resolvedKeyCache.key;
    return listMagicHourKeyCandidates()[0]?.key || '';
}

/** Which env var supplies the active key (after probe, or first candidate). */
function getMagicHourApiKeySource() {
    if (resolvedKeyCache?.source) return resolvedKeyCache.source;
    return listMagicHourKeyCandidates()[0]?.source || null;
}

/** Safe hint for logs/status — never returns the full secret. */
function getMagicHourKeyPrefixHint() {
    const key = getMagicHourApiKey();
    if (!key) return null;
    if (/^mhk_/i.test(key)) return `${key.slice(0, 12)}…`;
    return key.length >= 8 ? `${key.slice(0, 8)}…` : '[present]';
}

function getMagicHourKeyDiagnostics() {
    const candidates = listMagicHourKeyCandidates();
    const key = getMagicHourApiKey();
    const sources = candidates.map((item) => item.source);
    const duplicateKeySources = candidates.length > 1
        ? sources
        : [];
    return {
        apiKeyPresent: Boolean(key),
        apiKeySource: getMagicHourApiKeySource(),
        keyPrefixHint: getMagicHourKeyPrefixHint(),
        candidateKeySources: sources,
        multipleKeysConfigured: candidates.length > 1,
        ...(candidates.length > 1 && getMagicHourApiKeySource() === 'MAGIC_HOUR_API_KEY'
            ? { hint: 'If generation fails with 401, ensure MAGIC_HOUR_API_KEY is the active Developer Hub key (not an old copy). AllModelAi_API_KEY_VIDEO is used as fallback when the primary key is rejected.' }
            : {}),
    };
}

function isMagicHourConfigured() {
    return listMagicHourKeyCandidates().length > 0;
}

function getMagicHourVideoModel() {
    return strip(process.env.MAGIC_HOUR_VIDEO_MODEL) || 'ltx-2.5';
}

function getMagicHourDefaultDurationSeconds() {
    const value = Number(process.env.MAGIC_HOUR_VIDEO_DURATION_SECONDS);
    if (Number.isFinite(value) && value >= 1 && value <= 60) return value;
    return 3;
}

function pollIntervalMs() {
    const value = Number(process.env.MAGIC_HOUR_POLL_MS);
    return Number.isFinite(value) && value >= 3000 ? value : 8000;
}

function pollTimeoutMs() {
    const value = Number(process.env.MAGIC_HOUR_TIMEOUT_MS);
    return Number.isFinite(value) && value >= 60000 ? value : 900000;
}

function resolveVideoProviderPreference(requested, { magicHourAuthOk = null } = {}) {
    const req = strip(requested).toLowerCase();
    const magicHourAllowed = isMagicHourConfigured()
        && (magicHourAuthOk === null || magicHourAuthOk === true);
    if (req === 'gemini' || req === 'google' || req === 'veo') return 'gemini';
    if (req === 'magichour' || req === 'magic-hour') return 'magichour';
    const pref = strip(process.env.VIDEO_PROVIDER).toLowerCase();
    if (pref === 'gemini' || pref === 'google' || pref === 'veo') return 'gemini';
    if (pref === 'magichour' || pref === 'magic-hour') return 'magichour';
    if (magicHourAllowed) return 'magichour';
    if (isMagicHourConfigured() && magicHourAuthOk === false) {
        const { isGeminiVideoConfigured } = require('./geminiVideoService');
        if (isGeminiVideoConfigured()) return 'gemini';
    }
    if (isMagicHourConfigured()) return 'magichour';
    return 'gemini';
}

module.exports = {
    getMagicHourApiKey,
    getMagicHourApiKeySource,
    listMagicHourKeyCandidates,
    setResolvedMagicHourKey,
    clearResolvedMagicHourKeyCache,
    getMagicHourKeyPrefixHint,
    getMagicHourKeyDiagnostics,
    isMagicHourConfigured,
    getMagicHourVideoModel,
    getMagicHourDefaultDurationSeconds,
    pollIntervalMs,
    pollTimeoutMs,
    resolveVideoProviderPreference,
};
