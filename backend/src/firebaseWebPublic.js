const WEB_ENV = {
    apiKey: ['FIREBASE_WEB_API_KEY', 'VITE_FIREBASE_API_KEY'],
    authDomain: ['FIREBASE_WEB_AUTH_DOMAIN', 'VITE_FIREBASE_AUTH_DOMAIN', 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'],
    projectId: ['FIREBASE_WEB_PROJECT_ID', 'VITE_FIREBASE_PROJECT_ID', 'FIREBASE_PROJECT_ID'],
    appId: ['FIREBASE_WEB_APP_ID', 'VITE_FIREBASE_APP_ID'],
};

function envTrim(name) {
    return String(process.env[name] || '').trim();
}

function isUsableFirebaseWebValue(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return false;
    if (/^(your[-_]?|replace|changeme|xxx+|test)$/i.test(trimmed)) return false;
    if (/^your[-_]?(project|firebase|api|app)[-_]?/i.test(trimmed)) return false;
    return true;
}

function readFirebaseWebConfigFromProcessEnv() {
    const config = {};
    for (const [field, names] of Object.entries(WEB_ENV)) {
        let value = '';
        for (const name of names) {
            const candidate = envTrim(name);
            if (isUsableFirebaseWebValue(candidate)) {
                value = candidate;
                break;
            }
        }
        config[field] = value;
    }
    return config;
}

function isFirebaseWebConfigComplete(config) {
    return Object.values(config).every((value) => isUsableFirebaseWebValue(value));
}

function getPublicFirebaseWebConfig() {
    const config = readFirebaseWebConfigFromProcessEnv();
    if (!isFirebaseWebConfigComplete(config)) {
        return { configured: false, config: null };
    }
    return {
        configured: true,
        config: {
            apiKey: config.apiKey,
            authDomain: config.authDomain,
            projectId: config.projectId,
            appId: config.appId,
        },
    };
}

module.exports = {
    getPublicFirebaseWebConfig,
    isUsableFirebaseWebValue,
    isFirebaseWebConfigComplete,
    readFirebaseWebConfigFromProcessEnv,
};
