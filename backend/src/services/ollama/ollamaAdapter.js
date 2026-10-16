/**
 * Secure Ollama adapter — allowlisted hosts only (no SSRF).
 * Cloud Render cannot reach user localhost; desktop/local backends can.
 */

const { parseEnvBoolean } = require('../../platform/featureRegistry');

const DEFAULT_ALLOWLIST = ['127.0.0.1', 'localhost', '::1'];

function isOllamaFeatureEnabled() {
    return parseEnvBoolean('FEATURE_OLLAMA_LOCAL', true);
}

function allowlistedHosts() {
    const configured = String(process.env.OLLAMA_ALLOWLIST_HOSTS || '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
    return configured.length ? configured : DEFAULT_ALLOWLIST;
}

function resolveOllamaBaseUrl() {
    const raw = String(process.env.OLLAMA_URL || 'http://127.0.0.1:11434').trim();
    let url;
    try {
        url = new URL(raw);
    } catch {
        const error = new Error('OLLAMA_URL is invalid');
        error.status = 500;
        error.code = 'OLLAMA_CONFIG';
        throw error;
    }
    if (!/^https?:$/i.test(url.protocol)) {
        const error = new Error('OLLAMA_URL must be http or https');
        error.status = 500;
        error.code = 'OLLAMA_CONFIG';
        throw error;
    }
    const host = url.hostname.toLowerCase();
    if (!allowlistedHosts().includes(host)) {
        const error = new Error('Ollama host is not allowlisted. Set OLLAMA_ALLOWLIST_HOSTS for a user-hosted endpoint.');
        error.status = 403;
        error.code = 'OLLAMA_HOST_DENIED';
        throw error;
    }
    // Block obvious private cloud pivots beyond allowlist (already enforced).
    return url.origin.replace(/\/$/, '');
}

function authHeaders() {
    const token = String(process.env.OLLAMA_AUTH_TOKEN || '').trim();
    if (!token) return { 'Content-Type': 'application/json' };
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
    };
}

async function checkConnection() {
    if (!isOllamaFeatureEnabled()) {
        return {
            online: false,
            mode: 'disabled',
            message: 'Local Ollama integration is disabled (FEATURE_OLLAMA_LOCAL).',
            models: [],
        };
    }
    try {
        const base = resolveOllamaBaseUrl();
        const response = await fetch(`${base}/api/tags`, {
            method: 'GET',
            headers: authHeaders(),
            signal: AbortSignal.timeout(Number(process.env.OLLAMA_TIMEOUT_MS || 5000)),
        });
        if (!response.ok) {
            return {
                online: false,
                mode: 'local',
                baseUrlHost: new URL(base).hostname,
                message: `Ollama returned ${response.status}`,
                models: [],
            };
        }
        const data = await response.json();
        return {
            online: true,
            mode: 'local',
            baseUrlHost: new URL(base).hostname,
            note: 'Local models still use your device electricity/hardware. A cloud backend cannot reach Ollama on your PC via localhost.',
            models: (data.models || []).map((model) => ({
                name: model.name,
                size: model.size,
                modifiedAt: model.modified_at,
                local: true,
            })),
        };
    } catch (error) {
        return {
            online: false,
            mode: 'local',
            models: [],
            message: error.code === 'OLLAMA_HOST_DENIED'
                ? error.message
                : 'Ollama is not reachable. Start Ollama locally or configure an authenticated allowlisted endpoint.',
            code: error.code || 'OLLAMA_UNAVAILABLE',
        };
    }
}

async function generateChat({ model, messages, stream = false } = {}) {
    if (!isOllamaFeatureEnabled()) {
        const error = new Error('Local Ollama integration is disabled');
        error.status = 503;
        throw error;
    }
    const base = resolveOllamaBaseUrl();
    const response = await fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: authHeaders(),
        signal: AbortSignal.timeout(Number(process.env.OLLAMA_CHAT_TIMEOUT_MS || 120_000)),
        body: JSON.stringify({
            model,
            messages,
            stream: Boolean(stream),
        }),
    });
    if (!response.ok) {
        const error = new Error(`Ollama chat failed (${response.status})`);
        error.status = 502;
        error.code = 'OLLAMA_CHAT_FAILED';
        throw error;
    }
    if (stream) return response;
    const data = await response.json();
    return {
        text: data?.message?.content || '',
        model: data?.model || model,
        provider: 'ollama',
        local: true,
        raw: data,
    };
}

module.exports = {
    isOllamaFeatureEnabled,
    allowlistedHosts,
    resolveOllamaBaseUrl,
    checkConnection,
    generateChat,
};
