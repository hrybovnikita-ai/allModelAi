const {
    creemApiBaseUrl,
    getCreemApiKey,
    isCreemCheckoutEnabled,
} = require('./creemConfig');

/**
 * Creem Moderation API — required for AI image/video merchants.
 * Docs: https://docs.creem.io/features/moderation
 *
 * Disabled by default until merchant approval / CREEM_MODERATION_ENABLED=true.
 * When checkout is enabled without an explicit moderation flag, moderation turns on
 * so live Creem payments stay compliant.
 */
function isCreemModerationEnabled() {
    const explicit = String(process.env.CREEM_MODERATION_ENABLED || '').trim().toLowerCase();
    if (explicit === 'true' || explicit === '1') return true;
    if (explicit === 'false' || explicit === '0') return false;
    return isCreemCheckoutEnabled();
}

function resolveFetch(fetchImpl) {
    if (typeof fetchImpl === 'function') return fetchImpl;
    if (typeof globalThis.fetch === 'function') return globalThis.fetch.bind(globalThis);
    return null;
}

async function screenPromptWithCreem({ prompt, externalId, fetchImpl } = {}) {
    const text = String(prompt || '').trim();
    if (!text) {
        return { skipped: true, reason: 'empty_prompt' };
    }
    if (!isCreemModerationEnabled()) {
        return { skipped: true, reason: 'moderation_disabled' };
    }
    const apiKey = getCreemApiKey();
    if (!apiKey) {
        const error = new Error('Creem moderation is enabled but CREEM_API_KEY is missing.');
        error.code = 'CREEM_MODERATION_UNCONFIGURED';
        error.status = 503;
        throw error;
    }
    const doFetch = resolveFetch(fetchImpl);
    if (!doFetch) {
        const error = new Error('Creem moderation is temporarily unavailable.');
        error.code = 'CREEM_MODERATION_UNAVAILABLE';
        error.status = 503;
        throw error;
    }
    let response;
    try {
        response = await doFetch(`${creemApiBaseUrl()}/v1/moderation/prompt`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
            },
            body: JSON.stringify({
                prompt: text,
                ...(externalId ? { external_id: String(externalId) } : {}),
            }),
            signal: AbortSignal.timeout(5000),
        });
    } catch (cause) {
        const error = new Error('Creem moderation is temporarily unavailable.');
        error.code = 'CREEM_MODERATION_UNAVAILABLE';
        error.status = 503;
        error.cause = cause;
        throw error;
    }
    if (!response.ok) {
        const error = new Error('Creem moderation request failed.');
        error.code = 'CREEM_MODERATION_UNAVAILABLE';
        error.status = 503;
        error.httpStatus = response.status;
        throw error;
    }
    const payload = await response.json().catch(() => ({}));
    const decision = String(payload?.decision || '').trim().toLowerCase();
    if (decision === 'deny' || decision === 'flag') {
        const error = new Error(
            'Your prompt was rejected because it violates our content policy. Please revise and try again.',
        );
        error.code = decision === 'flag' ? 'CREEM_PROMPT_FLAGGED' : 'CREEM_PROMPT_DENIED';
        error.status = 400;
        error.decision = decision;
        error.moderationId = payload?.id || null;
        throw error;
    }
    return {
        skipped: false,
        allowed: true,
        decision: decision || 'allow',
        moderationId: payload?.id || null,
        usage: payload?.usage || null,
    };
}

module.exports = {
    isCreemModerationEnabled,
    screenPromptWithCreem,
};
