const cors = require('cors');

const splitOrigins = (value) => String(value || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

const configuredOrigins = () => [...new Set([
    ...splitOrigins(process.env.PUBLIC_URL),
    ...splitOrigins(process.env.FRONTEND_ORIGIN || 'http://localhost:5173'),
])];

const requestOrigin = (req) => {
    const host = String(req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
    if (!host) return '';
    const proto = String(req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
    return `${proto}://${host}`;
};

const originHost = (origin) => {
    try {
        return new URL(origin).host;
    } catch {
        return '';
    }
};

const isAllowedOrigin = (origin, req) => {
    if (!origin) return true;
    const normalized = origin.replace(/\/$/, '');
    if (configuredOrigins().includes(normalized)) return true;
    const host = String(req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
    return Boolean(host) && originHost(normalized) === host;
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

const configurePublicAccess = (app) => {
    app.set('trust proxy', 1);
    app.use((req, res, next) => {
        cors({
            origin: (origin, callback) => callback(null, isAllowedOrigin(origin, req)),
            credentials: true,
        })(req, res, next);
    });
};

module.exports = {
    configuredOrigins,
    requestOrigin,
    isAllowedOrigin,
    publicAppOrigin,
    configurePublicAccess,
};
