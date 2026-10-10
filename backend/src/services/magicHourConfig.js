const strip = (value) => String(value || '').trim().replace(/^["']|["']$/g, '');

function getMagicHourApiKey() {
    return strip(process.env.MAGIC_HOUR_API_KEY) || strip(process.env.MAGIC_CHOUR_API_KEY);
}

/** Which env var supplied the active key (canonical name preferred). */
function getMagicHourApiKeySource() {
    if (strip(process.env.MAGIC_HOUR_API_KEY)) return 'MAGIC_HOUR_API_KEY';
    if (strip(process.env.MAGIC_CHOUR_API_KEY)) return 'MAGIC_CHOUR_API_KEY';
    return null;
}

/** Safe hint for logs/status — never returns the full secret. */
function getMagicHourKeyPrefixHint() {
    const key = getMagicHourApiKey();
    if (!key) return null;
    if (/^mhk_/i.test(key)) return `${key.slice(0, 12)}…`;
    return key.length >= 8 ? `${key.slice(0, 8)}…` : '[present]';
}

function getMagicHourKeyDiagnostics() {
    const key = getMagicHourApiKey();
    return {
        apiKeyPresent: Boolean(key),
        apiKeySource: getMagicHourApiKeySource(),
        keyPrefixHint: getMagicHourKeyPrefixHint(),
    };
}

function isMagicHourConfigured() {
    return Boolean(getMagicHourApiKey());
}

function getMagicHourVideoModel() {
    return strip(process.env.MAGIC_HOUR_VIDEO_MODEL) || 'ltx-2.5';
}

function getMagicHourDefaultDurationSeconds() {
    const value = Number(process.env.MAGIC_HOUR_VIDEO_DURATION_SECONDS);
    if (Number.isFinite(value) && value >= 1 && value <= 60) return value;
    return 5;
}

function pollIntervalMs() {
    const value = Number(process.env.MAGIC_HOUR_POLL_MS);
    return Number.isFinite(value) && value >= 3000 ? value : 8000;
}

function pollTimeoutMs() {
    const value = Number(process.env.MAGIC_HOUR_TIMEOUT_MS);
    return Number.isFinite(value) && value >= 60000 ? value : 900000;
}

function resolveVideoProviderPreference(requested) {
    const req = strip(requested).toLowerCase();
    if (req === 'gemini' || req === 'google' || req === 'veo') return 'gemini';
    if (req === 'magichour' || req === 'magic-hour') return 'magichour';
    const pref = strip(process.env.VIDEO_PROVIDER).toLowerCase();
    if (pref === 'gemini' || pref === 'google' || pref === 'veo') return 'gemini';
    if (pref === 'magichour' || pref === 'magic-hour') return 'magichour';
    if (isMagicHourConfigured()) return 'magichour';
    return 'gemini';
}

module.exports = {
    getMagicHourApiKey,
    getMagicHourApiKeySource,
    getMagicHourKeyPrefixHint,
    getMagicHourKeyDiagnostics,
    isMagicHourConfigured,
    getMagicHourVideoModel,
    getMagicHourDefaultDurationSeconds,
    pollIntervalMs,
    pollTimeoutMs,
    resolveVideoProviderPreference,
};
