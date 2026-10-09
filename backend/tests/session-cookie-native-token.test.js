const { test } = require('node:test');
const assert = require('node:assert/strict');

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
