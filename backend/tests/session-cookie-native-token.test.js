const { test } = require('node:test');
const assert = require('node:assert/strict');

test('Vite dev proxy (localhost:5173 → 127.0.0.1:5050) does not issue native session token', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
        delete require.cache[require.resolve('../src/sessionCookie')];
        const { shouldIssueNativeSessionToken } = require('../src/sessionCookie');
        const req = {
            get(name) {
                if (name === 'origin') return 'http://localhost:5173';
                if (name === 'host') return '127.0.0.1:5050';
                if (name === 'x-forwarded-proto') return 'http';
                return '';
            },
        };
        assert.equal(shouldIssueNativeSessionToken(req), false);
    } finally {
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;
        delete require.cache[require.resolve('../src/sessionCookie')];
    }
});

test('split deploy on Render issues native session token for allowed browser origins', () => {
    const previous = process.env.FRONTEND_ORIGIN;
    process.env.FRONTEND_ORIGIN = 'https://all-model-ai.com';
    try {
        const { shouldIssueNativeSessionToken } = require('../src/sessionCookie');
        const req = {
            get(name) {
                if (name === 'origin') return 'https://all-model-ai.com';
                if (name === 'host') return 'allmodelai-backend.onrender.com';
                if (name === 'x-forwarded-proto') return 'https';
                if (name === 'x-forwarded-host') return 'all-model-ai.com';
                return '';
            },
        };
        assert.equal(shouldIssueNativeSessionToken(req), true);
    } finally {
        if (previous === undefined) delete process.env.FRONTEND_ORIGIN;
        else process.env.FRONTEND_ORIGIN = previous;
    }
});
