const express = require('express');
const http = require('node:http');
const https = require('node:https');

const UPSTREAM_TIMEOUT_MS = Number(process.env.PROXY_UPSTREAM_TIMEOUT_MS || 180000);
const httpsKeepAliveAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 32,
    timeout: UPSTREAM_TIMEOUT_MS,
});

const hopHeaders = new Set(['connection', 'keep-alive', 'proxy-authenticate',
    'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);

function forwardedHeaders(headers) {
    const excluded = new Set([...hopHeaders, ...String(headers.connection || '')
        .split(',').map((name) => name.trim().toLowerCase())]);
    return Object.fromEntries(Object.entries(headers).filter(([name]) => !excluded.has(name)));
}

function applyUpstreamHeaders(res, upstreamHeaders) {
    const headers = forwardedHeaders(upstreamHeaders);
    for (const [name, value] of Object.entries(headers)) {
        if (value === undefined) continue;
        if (name === 'set-cookie') {
            res.setHeader('Set-Cookie', value);
            continue;
        }
        res.setHeader(name, value);
    }
}

function proxyFailureCode(error) {
    if (!error) return 'UPSTREAM_CONNECTION_FAILED';
    if (error.message === 'Backend timed out') return 'PROXY_TIMEOUT';
    return 'UPSTREAM_CONNECTION_FAILED';
}

function safePathname(url) {
    return String(url || '').split('?')[0] || '/api';
}

function createVercelProxy({ origin = process.env.PERSISTENT_BACKEND_ORIGIN, allowHttp = false } = {}) {
    const app = express();
    app.set('trust proxy', 1);
    let backend;
    try {
        backend = new URL(origin);
        if (backend.username || backend.password || backend.pathname !== '/' || backend.search || backend.hash
            || (backend.protocol !== 'https:' && !(allowHttp && backend.protocol === 'http:'))) backend = null;
    } catch { backend = null; }

    app.use((req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        if (!req.url.startsWith('/api/')) return res.status(404).json({ message: 'Route not found' });
        if (!backend || req.get('x-allmodelai-proxy-hop')) {
            return res.status(503).json({ message: 'Persistent backend is not configured. Please contact the site administrator.' });
        }
        const headers = forwardedHeaders(req.headers);
        headers.host = backend.host;
        headers['x-forwarded-host'] = req.get('x-forwarded-host') || req.get('host');
        headers['x-forwarded-proto'] = req.protocol;
        headers['x-allmodelai-proxy-hop'] = '1';
        const transport = backend.protocol === 'https:' ? https : http;
        const startedAt = Date.now();
        const pathname = safePathname(req.url);
        if (process.env.NODE_ENV !== 'test') {
            console.log(`[PROXY] UPSTREAM_REQUEST ${req.method} ${pathname}`);
        }
        const upstream = transport.request({
            protocol: backend.protocol,
            hostname: backend.hostname,
            port: backend.port || (backend.protocol === 'https:' ? 443 : 80),
            path: req.url,
            method: req.method,
            headers,
            agent: backend.protocol === 'https:' ? httpsKeepAliveAgent : undefined,
        }, (response) => {
            if (process.env.NODE_ENV !== 'test') {
                console.log(`[PROXY] UPSTREAM_RESPONSE ${req.method} ${pathname} ${response.statusCode} ${Date.now() - startedAt}ms`);
            }
            res.status(response.statusCode);
            applyUpstreamHeaders(res, response.headers);
            res.setHeader('Cache-Control', 'no-store');
            response.on('error', () => res.destroy());
            response.pipe(res);
        });
        upstream.setTimeout(UPSTREAM_TIMEOUT_MS, () => upstream.destroy(new Error('Backend timed out')));
        upstream.on('error', (error) => {
            if (process.env.NODE_ENV !== 'test') {
                console.log(`[PROXY] ${proxyFailureCode(error)} ${req.method} ${pathname} ${Date.now() - startedAt}ms`);
            }
            if (res.headersSent) return res.destroy();
            res.status(503).json({ message: 'Could not reach the server. Please retry. Your conversation is still open.' });
        });
        req.on('aborted', () => upstream.destroy());
        res.on('close', () => { if (!res.writableFinished) upstream.destroy(); });
        req.pipe(upstream);
    });
    return app;
}

module.exports = {
    createVercelProxy,
    applyUpstreamHeaders,
    proxyFailureCode,
    UPSTREAM_TIMEOUT_MS,
};
