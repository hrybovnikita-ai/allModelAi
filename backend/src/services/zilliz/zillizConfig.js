/**
 * Zilliz Cloud / Milvus configuration (no secrets in logs).
 * Intended SDK: @zilliz/milvus2-sdk-node
 * Auth: address + token (API key OR "username:password").
 */

function trimEnv(name) {
    return String(process.env[name] || '').trim();
}

function maskSecret(value) {
    const text = String(value || '');
    if (!text) return '(empty)';
    if (text.length <= 4) return '****';
    return `${text.slice(0, 2)}…${text.slice(-2)} (len=${text.length})`;
}

function resolveZillizToken() {
    const explicit = trimEnv('ZILLIZ_TOKEN');
    if (explicit) return { token: explicit, source: 'ZILLIZ_TOKEN' };
    const user = trimEnv('ZILLIZ_API_USER');
    const password = trimEnv('ZILLIZ_API_PASSWORD');
    if (user && password) {
        return { token: `${user}:${password}`, source: 'ZILLIZ_API_USER:ZILLIZ_API_PASSWORD' };
    }
    return { token: '', source: null };
}

function getZillizConfig() {
    const address = trimEnv('ZILLIZ_URI') || trimEnv('ZILLIZ_ENDPOINT') || trimEnv('MILVUS_URI');
    const { token, source: tokenSource } = resolveZillizToken();
    const username = trimEnv('ZILLIZ_API_USER');
    const password = trimEnv('ZILLIZ_API_PASSWORD');
    const collection = trimEnv('ZILLIZ_COLLECTION') || 'allmodelai_user_memory';
    const database = trimEnv('ZILLIZ_DATABASE') || 'default';
    const enabledFlag = trimEnv('ZILLIZ_ENABLED').toLowerCase();
    const enabled = enabledFlag === 'true' || enabledFlag === '1'
        || (enabledFlag === '' && Boolean(address && token));

    return {
        enabled,
        address,
        token,
        tokenSource,
        username,
        password,
        collection,
        database,
        configured: Boolean(address && token),
    };
}

/** Safe diagnostic summary — never includes credentials. */
function getZillizConfigReport() {
    const cfg = getZillizConfig();
    return {
        enabled: cfg.enabled,
        configured: cfg.configured,
        addressPresent: Boolean(cfg.address),
        tokenPresent: Boolean(cfg.token),
        tokenSource: cfg.tokenSource,
        usernamePresent: Boolean(cfg.username),
        passwordPresent: Boolean(cfg.password),
        collection: cfg.collection,
        database: cfg.database,
        sdk: '@zilliz/milvus2-sdk-node',
        authMode: cfg.tokenSource === 'ZILLIZ_TOKEN'
            ? 'token'
            : cfg.tokenSource
                ? 'username_password_token'
                : 'unconfigured',
        // lengths only
        addressHint: cfg.address ? maskSecret(cfg.address.replace(/^https?:\/\//, '').split('.')[0] || 'host') : '(empty)',
    };
}

module.exports = {
    getZillizConfig,
    getZillizConfigReport,
    resolveZillizToken,
};
