const cors = require('cors');

/** Production Vercel site for AllModelAI (split deploy). */
const ALL_MODEL_AI_VERCEL_PRODUCTION = 'https://all-model-ai.vercel.app';

/** Custom production domains on Vercel (apex + www). */
const ALL_MODEL_AI_CUSTOM_PRODUCTION = 'https://all-model-ai.com';
const ALL_MODEL_AI_WWW_PRODUCTION = 'https://www.all-model-ai.com';
/** Firebase Auth custom domain (primary). */
const ALLMODELAI_CUSTOM_PRODUCTION = 'https://allmodelai.com';
const ALLMODELAI_WWW_PRODUCTION = 'https://www.allmodelai.com';

const ALL_MODEL_AI_BUILTIN_PRODUCTION_ORIGINS = [
    ALLMODELAI_CUSTOM_PRODUCTION,
    ALLMODELAI_WWW_PRODUCTION,
    ALL_MODEL_AI_CUSTOM_PRODUCTION,
    ALL_MODEL_AI_WWW_PRODUCTION,
    ALL_MODEL_AI_VERCEL_PRODUCTION,
];

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
    ...ALL_MODEL_AI_BUILTIN_PRODUCTION_ORIGINS,
];

const originHost = (origin) => {
    try {
        return new URL(origin).host;
    } catch {
        return '';
    }
};

const normalizeOrigin = (origin) => String(origin || '').trim().replace(/\/$/, '');

function isPrivateLanHost(hostname) {
    const host = String(hostname || '').toLowerCase();
    if (!host) return false;
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '[::1]') return true;
    if (host.endsWith('.local')) return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    return false;
}

/** Same Wi‑Fi / LAN dev (e.g. http://192.168.0.12:5173). Off in production unless explicitly enabled. */
function isLocalNetworkDevOrigin(origin) {
    const enabled = process.env.NODE_ENV !== 'production'
        || process.env.CORS_ALLOW_LOCAL_NETWORK === 'true'
        || process.env.CORS_ALLOW_LAN === 'true';
    if (!enabled) return false;
    try {
        const url = new URL(normalizeOrigin(origin));
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
        return isPrivateLanHost(url.hostname);
    } catch {
        return false;
    }
}

/**
 * HTTPS Vercel preview deployments for the all-model-ai project.
 * Matches production and branch previews such as all-model-ai-git-main-*.vercel.app.
 */
function isAllModelAiProductionWebOrigin(origin) {
    const normalized = normalizeOrigin(origin);
    return ALL_MODEL_AI_BUILTIN_PRODUCTION_ORIGINS.includes(normalized);
}

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
    if (isAllModelAiProductionWebOrigin(normalized)) return true;
    if (isAllModelAiVercelProjectOrigin(normalized)) return true;
    if (configuredOrigins().includes(normalized)) return true;
    if (isLocalNetworkDevOrigin(normalized)) return true;
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
    ALL_MODEL_AI_CUSTOM_PRODUCTION,
    ALL_MODEL_AI_WWW_PRODUCTION,
    ALL_MODEL_AI_BUILTIN_PRODUCTION_ORIGINS,
    CORS_ALLOWED_METHODS,
    CORS_ALLOWED_HEADERS,
    configuredOrigins,
    isAllModelAiProductionWebOrigin,
    isAllModelAiVercelProjectOrigin,
    isAllowedOrigin,
    isNativeAppOrigin,
    isLocalNetworkDevOrigin,
    isPrivateLanHost,
    createCredentialedCorsMiddleware,
    normalizeOrigin,
};
