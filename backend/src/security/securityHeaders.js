/**
 * Lightweight security headers (helmet-compatible subset without a new dependency).
 * Applied to all /api responses. Does not change CORS policy.
 */
function securityHeadersMiddleware(_req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('X-Download-Options', 'noopen');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader(
        'Permissions-Policy',
        'camera=(), microphone=(), geolocation=(), payment=()',
    );
    // API responses are JSON; avoid embedding foreign scripts.
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    if (process.env.NODE_ENV === 'production' || process.env.FORCE_HSTS === 'true') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    return next();
}

module.exports = {
    securityHeadersMiddleware,
};
