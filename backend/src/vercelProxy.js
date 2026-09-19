const express = require('express');
const http = require('node:http');
const https = require('node:https');

const hopHeaders = new Set(['connection', 'keep-alive', 'proxy-authenticate',
    'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);

function forwardedHeaders(headers) {
    const excluded = new Set([...hopHeaders, ...String(headers.connection || '')
        .split(',').map((name) => name.trim().toLowerCase())]);
    return Object.fromEntries(Object.entries(headers).filter(([name]) => !excluded.has(name)));
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
        // Pipe both directions to preserve uploads, multiple cookies and SSE chat streams.
        const upstream = transport.request(new URL(backend.origin + req.url), {
            method: req.method, headers,
        }, (response) => {
            res.status(response.statusCode);
            for (const [name, value] of Object.entries(forwardedHeaders(response.headers))) {
                if (value !== undefined) res.setHeader(name, value);
            }
            res.setHeader('Cache-Control', 'no-store');
            response.on('error', () => res.destroy());
            response.pipe(res);
        });
        upstream.setTimeout(120000, () => upstream.destroy(new Error('Backend timed out')));
        upstream.on('error', () => {
            if (res.headersSent) return res.destroy();
            res.status(503).json({ message: 'Could not reach the server. Please retry. Your conversation is still open.' });
        });
        req.on('aborted', () => upstream.destroy());
        res.on('close', () => { if (!res.writableFinished) upstream.destroy(); });
        req.pipe(upstream);
    });
    return app;
}

module.exports = { createVercelProxy };
