const {
    ALL_MODEL_AI_VERCEL_PRODUCTION,
    configuredOrigins,
    isAllowedOrigin,
    isNativeAppOrigin,
    isAllModelAiVercelProjectOrigin,
    createCredentialedCorsMiddleware,
} = require('./corsPolicy');

const splitOrigins = (value) => String(value || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

const requestOrigin = (req) => {
    const host = String(req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
    if (!host) return '';
    const proto = String(req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
    return `${proto}://${host}`;
};

const publicAppOrigin = (req) => {
    const published = splitOrigins(process.env.PUBLIC_URL)[0];
    if (published) return published;
    if (req) {
        const origin = requestOrigin(req);
        if (origin) return origin;
    }
    return configuredOrigins()[0];
};

function configureTrustProxy(app) {
    app.set('trust proxy', 1);
}

/** @deprecated Use configureTrustProxy + createCredentialedCorsMiddleware in localApp instead. */
const configurePublicAccess = (app) => {
    configureTrustProxy(app);
    app.use(createCredentialedCorsMiddleware());
};

module.exports = {
    ALL_MODEL_AI_VERCEL_PRODUCTION,
    configuredOrigins,
    requestOrigin,
    isAllowedOrigin,
    isNativeAppOrigin,
    isAllModelAiVercelProjectOrigin,
    publicAppOrigin,
    configureTrustProxy,
    createCredentialedCorsMiddleware,
    configurePublicAccess,
};
