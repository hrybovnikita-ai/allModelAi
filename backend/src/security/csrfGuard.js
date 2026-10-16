const { isAllowedOrigin } = require('../publicAccess');
const { isCapacitorClientRequest } = require('../sessionCookie');
const { securityWarn } = require('./structuredLog');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Cookie-session CSRF guard for mutating /api requests.
 *
 * Skips:
 * - Safe HTTP methods
 * - Bearer API-key auth
 * - Native session header (Capacitor / Electron cross-origin)
 * - Capacitor / Electron clients
 * - Payment webhooks (mounted before this middleware)
 * - When ENABLE_CSRF_GUARD=false
 *
 * Allows when Origin (or Referer origin) is in the CORS allowlist.
 */
function parseEnvBoolean(name, defaultValue) {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return defaultValue;
    return !/^(0|false|no|off)$/i.test(String(raw).trim());
}

function originFromReferer(referer) {
    try {
        return new URL(String(referer || '')).origin;
    } catch {
        return '';
    }
}

function csrfGuardMiddleware(req, res, next) {
    const enabled = parseEnvBoolean(
        'ENABLE_CSRF_GUARD',
        process.env.NODE_ENV === 'production',
    );
    if (!enabled) return next();
    if (SAFE_METHODS.has(String(req.method || '').toUpperCase())) return next();

    // API keys are not cookie CSRF-vulnerable.
    const auth = String(req.get('authorization') || '');
    if (/^Bearer\s+amai_/i.test(auth)) return next();

    // Native / Capacitor clients use header session tokens, not browser cookie CSRF.
    if (req.get('x-allmodelai-session')) return next();
    if (isCapacitorClientRequest(req)) return next();
    if (String(req.get('x-allmodelai-client') || '').toLowerCase() === 'electron') {
        return next();
    }

    // No cookie → nothing to forge via cookie CSRF.
    if (!req.cookies?.allmodelai_session && !req.signedCookies?.allmodelai_session) {
        return next();
    }

    const origin = String(req.get('origin') || '').trim();
    const refererOrigin = originFromReferer(req.get('referer'));
    const candidate = origin || refererOrigin;

    if (!candidate) {
        // Same-site navigations may omit Origin; require Referer in production for cookie POSTs.
        if (process.env.NODE_ENV === 'production') {
            securityWarn('csrf_rejected', {
                reason: 'missing_origin',
                path: req.path,
                ip: req.ip,
            });
            return res.status(403).json({
                message: 'Cross-site request blocked.',
                code: 'CSRF_REJECTED',
            });
        }
        return next();
    }

    if (isAllowedOrigin(candidate, req)) {
        return next();
    }

    securityWarn('csrf_rejected', {
        reason: 'origin_not_allowed',
        path: req.path,
        origin: candidate.slice(0, 120),
        ip: req.ip,
    });
    return res.status(403).json({
        message: 'Cross-site request blocked.',
        code: 'CSRF_REJECTED',
    });
}

module.exports = {
    csrfGuardMiddleware,
    parseEnvBoolean,
};
