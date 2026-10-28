'use strict';

/**
 * Reports which provider credentials exist in the server environment.
 * Raw values stay in the deployment secret store and are never returned.
 */

const PROVIDERS = [
    ['gemini', 'GEMINI_API_KEY'],
    ['groq', 'GROQ_API_KEY'],
    ['cloudflare', 'CLOUDFLARE_API_KEY'],
    ['ollama', 'OLLAMA_API_KEY'],
    ['openrouter', 'OPENROUTER_API_KEY'],
    ['openai', 'OPENAI_API_KEY'],
    ['deepseek', 'DEEPSEEK_API_KEY'],
    ['perplexity', 'PERPLEXITY_API_KEY'],
    ['github', 'GITHUB_CLIENT_SECRET'],
];

const disabled = new Set();

function maskPresent(value) {
    const text = String(value || '').trim();
    if (!text) return { configured: false, hint: '' };
    return { configured: true, hint: `${text.slice(0, 2)}…${text.slice(-2)} (${text.length} chars)` };
}

function listCredentials() {
    return PROVIDERS.map(([provider, envName]) => {
        const presence = maskPresent(process.env[envName]);
        return {
            provider,
            envName,
            configured: presence.configured,
            disabled: disabled.has(provider),
            hint: presence.configured ? presence.hint : '',
            storage: 'deployment-environment',
        };
    });
}

function setCredentialDisabled(provider, isDisabled) {
    const known = PROVIDERS.some(([name]) => name === provider);
    if (!known) {
        const error = new Error('Unknown provider.');
        error.status = 400;
        throw error;
    }
    if (isDisabled) disabled.add(provider);
    else disabled.delete(provider);
    return listCredentials().find((row) => row.provider === provider);
}

module.exports = {
    listCredentials,
    setCredentialDisabled,
};
