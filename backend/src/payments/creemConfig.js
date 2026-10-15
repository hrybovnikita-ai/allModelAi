const { sanitizeEnvSecret } = require('../openRouterConfig');

function envTrim(name) {
    return sanitizeEnvSecret(process.env[name]);
}

function getCreemApiKey() {
    return envTrim('CREEM_API_KEY');
}

function isCreemTestMode() {
    const explicit = String(process.env.CREEM_TEST_MODE || '').trim().toLowerCase();
    if (explicit === 'true' || explicit === '1') return true;
    if (explicit === 'false' || explicit === '0') return false;
    const key = getCreemApiKey();
    if (key.startsWith('creem_test_')) return true;
    if (key.startsWith('creem_') && !key.startsWith('creem_test_')) return false;
    return process.env.NODE_ENV !== 'production';
}

function creemApiBaseUrl() {
    return isCreemTestMode() ? 'https://test-api.creem.io' : 'https://api.creem.io';
}

function getCreemWebhookSecret() {
    return envTrim('CREEM_WEBHOOK_SECRET');
}

function isCreemCheckoutEnabled() {
    return String(process.env.CREEM_CHECKOUT_ENABLED || '').trim().toLowerCase() === 'true';
}

function isCreemLiveCheckoutAllowed() {
    return String(process.env.CREEM_ALLOW_LIVE_CHECKOUT || '').trim().toLowerCase() === 'true';
}

function isCreemLiveApiKey(apiKey = getCreemApiKey()) {
    const key = String(apiKey || '').trim();
    return key.startsWith('creem_') && !key.startsWith('creem_test_');
}

function creemConfigurationReport() {
    const missing = [];
    if (!getCreemApiKey()) missing.push('CREEM_API_KEY');
    if (!getCreemWebhookSecret()) missing.push('CREEM_WEBHOOK_SECRET');
    const testMode = isCreemTestMode();
    const checkoutEnabled = isCreemCheckoutEnabled();
    const liveKey = isCreemLiveApiKey();
    const liveBlocked = (!testMode || liveKey) && !isCreemLiveCheckoutAllowed();
    const moderationExplicit = String(process.env.CREEM_MODERATION_ENABLED || '').trim().toLowerCase();
    const moderationEnabled = moderationExplicit === 'true' || moderationExplicit === '1'
        || (moderationExplicit !== 'false' && moderationExplicit !== '0' && checkoutEnabled);
    return {
        configured: missing.length === 0,
        missing,
        testMode,
        checkoutEnabled,
        liveCheckoutBlocked: liveBlocked,
        liveApiKeyDetected: liveKey,
        merchantApprovalPending: !checkoutEnabled,
        moderationEnabled,
        apiBaseUrl: creemApiBaseUrl(),
        userMessage: !checkoutEnabled
            ? 'Creem checkout is disabled until merchant approval. AI Credits can be previewed; real checkout is not available yet.'
            : missing.length
                ? 'Creem is partially configured. Add missing environment variables on the server.'
                : liveBlocked
                    ? 'Creem live checkout requires CREEM_ALLOW_LIVE_CHECKOUT=true after merchant approval.'
                    : null,
    };
}

function assertCreemCheckoutAllowed() {
    const report = creemConfigurationReport();
    if (!report.checkoutEnabled) {
        return {
            ok: false,
            code: 'CREEM_CHECKOUT_DISABLED',
            message: 'Creem checkout is disabled until merchant approval completes.',
            report,
        };
    }
    if (!report.configured) {
        return {
            ok: false,
            code: 'CREEM_INCOMPLETE_CONFIG',
            message: `Creem is missing configuration: ${report.missing.join(', ')}`,
            report,
        };
    }
    if (report.liveCheckoutBlocked) {
        return {
            ok: false,
            code: 'CREEM_LIVE_BLOCKED',
            message: 'Creem live checkout is blocked. Use test mode/test API keys or set CREEM_ALLOW_LIVE_CHECKOUT=true after approval.',
            report,
        };
    }
    return { ok: true, report };
}

module.exports = {
    assertCreemCheckoutAllowed,
    creemApiBaseUrl,
    creemConfigurationReport,
    getCreemApiKey,
    getCreemWebhookSecret,
    isCreemCheckoutEnabled,
    isCreemLiveApiKey,
    isCreemLiveCheckoutAllowed,
    isCreemTestMode,
};
