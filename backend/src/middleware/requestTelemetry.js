const crypto = require('node:crypto');
const { recordHttpRequest } = require('../services/operationalMetrics');

const SKIP_PATHS = new Set(['/health', '/ready']);

function requestTelemetryMiddleware(req, res, next) {
    const path = String(req.path || '');
    if (SKIP_PATHS.has(path)) {
        return next();
    }

    const incoming =
        req.get('x-request-id')
        || req.get('x-correlation-id')
        || crypto.randomUUID();
    req.correlationId = incoming;
    res.setHeader('X-Request-Id', incoming);

    const started = process.hrtime.bigint();
    res.on('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
        recordHttpRequest({
            method: req.method,
            path: req.originalUrl || req.url || path,
            statusCode: res.statusCode,
            durationMs,
        });

        if (process.env.REQUEST_TELEMETRY_LOG === 'true' || res.statusCode >= 500) {
            const route = String(req.route?.path || path).slice(0, 80);
            console.log(JSON.stringify({
                ts: new Date().toISOString(),
                level: res.statusCode >= 500 ? 'error' : 'info',
                correlationId: incoming,
                method: req.method,
                route,
                status: res.statusCode,
                durationMs: Math.round(durationMs),
                outcome: res.statusCode >= 500 ? 'server_error' : res.statusCode >= 400 ? 'client_error' : 'ok',
            }));
        }
    });

    return next();
}

module.exports = {
    requestTelemetryMiddleware,
};
