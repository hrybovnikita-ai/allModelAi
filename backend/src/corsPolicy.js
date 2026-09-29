const cors = require('cors');

/** Production Vercel site for AllModelAI (split deploy). */
const ALL_MODEL_AI_VERCEL_PRODUCTION = 'https://all-model-ai.vercel.app';

const CORS_ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

const CORS_ALLOWED_HEADERS = [
    'Content-Type',
    'Authorization',
    'Accept',
    'X-AllModelAI-Auth',
    'X-AllModelAI-Client',
    'X-AllModelAI-Session',
];

const splitOrigins = (value) => String(value || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

const BUILTIN_NATIVE_ORIGINS = [
    'https://localhost',
    'http://localhost',
    'capacitor://localhost',
    'ionic://localhost',
];

const BUILTIN_FRONTEND_ORIGINS = [
    ALL_MODEL_AI_VERCEL_PRODUCTION,
];

const originHost = (origin) => {
    try {
        return new URL(origin).host;
    } catch {
        return '';
    }
};

const normalizeOrigin = (origin) => String(origin || '').trim().replace(/\/$/, '');

/**
 * HTTPS Vercel preview deployments for the all-model-ai project.
 * Matches production and branch previews such as all-model-ai-git-main-*.vercel.app.
 */
function isAllModelAiVercelProjectOrigin(origin) {
    const normalized = normalizeOrigin(origin);
    if (!/^https:\/\//i.test(normalized)) {
        return false;
    }
    let hostname;
    try {
        hostname = new URL(normalized).hostname.toLowerCase();
    } catch {
        return false;
    }
    if (hostname === 'all-model-ai.vercel.app') {
        return true;
    }
    if (!hostname.endsWith('.vercel.app')) {
        return false;
    }
    return hostname.startsWith('all-model-ai-');
}

function configuredOrigins() {
    const origins = [
        ...BUILTIN_FRONTEND_ORIGINS,
        ...splitOrigins(process.env.PUBLIC_URL),
        ...splitOrigins(process.env.FRONTEND_ORIGIN || 'http://localhost:5173'),
        ...splitOrigins(process.env.NATIVE_APP_ORIGINS),
        ...BUILTIN_NATIVE_ORIGINS,
    ];
    const vercelUrl = String(process.env.VERCEL_URL || '').trim();
    if (vercelUrl) {
        origins.push(`https://${vercelUrl.replace(/^https?:\/\//, '')}`);
    }
    return [...new Set(origins.map(normalizeOrigin))];
}

function isNativeAppOrigin(origin) {
    if (!origin || typeof origin !== 'string') return false;
    const normalized = normalizeOrigin(origin).toLowerCase();
    if (BUILTIN_NATIVE_ORIGINS.includes(normalized)) return true;
    if (normalized.startsWith('capacitor://') || normalized.startsWith('ionic://')) return true;
    return splitOrigins(process.env.NATIVE_APP_ORIGINS).some((item) => item.toLowerCase() === normalized);
}

function isAllowedOrigin(origin, req) {
    if (!origin) return true;
    const normalized = normalizeOrigin(origin);
    if (isNativeAppOrigin(normalized)) return true;
    if (isAllModelAiVercelProjectOrigin(normalized)) return true;
    if (configuredOrigins().includes(normalized)) return true;
    const host = String(req?.get?.('x-forwarded-host') || req?.get?.('host') || '').split(',')[0].trim();
    return Boolean(host) && originHost(normalized) === host;
}

function createCredentialedCorsMiddleware() {
    return (req, res, next) => {
        cors({
            origin: (requestOrigin, callback) => {
                if (!requestOrigin) {
                    callback(null, true);
                    return;
                }
                if (isAllowedOrigin(requestOrigin, req)) {
                    callback(null, requestOrigin);
                    return;
                }
                callback(null, false);
            },
            credentials: true,
            methods: CORS_ALLOWED_METHODS,
            allowedHeaders: CORS_ALLOWED_HEADERS,
            optionsSuccessStatus: 204,
        })(req, res, next);
    };
}

module.exports = {
    ALL_MODEL_AI_VERCEL_PRODUCTION,
    CORS_ALLOWED_METHODS,
    CORS_ALLOWED_HEADERS,
    configuredOrigins,
    isAllModelAiVercelProjectOrigin,
    isAllowedOrigin,
    isNativeAppOrigin,
    createCredentialedCorsMiddleware,
    normalizeOrigin,
};
