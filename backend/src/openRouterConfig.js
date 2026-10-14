/** Env var names that can supply an OpenRouter API key (priority order). */
const OPENROUTER_KEY_ENV_NAMES = [
    'ALLMODELAI_OPENROUTER_API_KEY',
    'OPENROUTER_API_KEY',
    'API_KEY',
];

function sanitizeEnvSecret(value) {
    let text = String(value || '').trim();
    if (
        (text.startsWith('"') && text.endsWith('"'))
        || (text.startsWith("'") && text.endsWith("'"))
    ) {
        text = text.slice(1, -1).trim();
    }
    return text;
}

function envTrim(name) {
    return sanitizeEnvSecret(process.env[name]);
}

/**
 * Resolved OpenRouter credential for server-side requests only.
 * Priority: ALLMODELAI_OPENROUTER_API_KEY → OPENROUTER_API_KEY → API_KEY (legacy).
 */
function getOpenRouterApiKey() {
    for (const name of OPENROUTER_KEY_ENV_NAMES) {
        const value = envTrim(name);
        if (value) return value;
    }
    return '';
}

function isOpenRouterConfigured() {
    return Boolean(getOpenRouterApiKey());
}

/** Which env var supplied the active key (for diagnostics; never log the value). */
function getOpenRouterKeySourceEnvName() {
    for (const name of OPENROUTER_KEY_ENV_NAMES) {
        if (envTrim(name)) return name;
    }
    return null;
}

module.exports = {
    OPENROUTER_KEY_ENV_NAMES,
    sanitizeEnvSecret,
    getOpenRouterApiKey,
    getOpenRouterKeySourceEnvName,
    isOpenRouterConfigured,
};
