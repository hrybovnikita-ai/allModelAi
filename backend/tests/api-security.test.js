'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-api-sec-${process.pid}-${Date.now()}.sqlite`);
process.env.ENABLE_CSRF_GUARD = 'true';
process.env.ENABLE_API_RATE_LIMIT = 'true';
process.env.ENABLE_USER_RATE_LIMIT = 'true';
process.env.API_RATE_LIMIT_API_PER_MIN = '5';
process.env.API_RATE_LIMIT_CHAT_PER_MIN = '5';
process.env.USER_RATE_LIMIT_PER_MIN = '3';
process.env.ADMIN_KEY = 'test-admin-key-phase1';

const {
    redactSecrets,
    redactObject,
    sanitizeAdminMetadata,
} = require('../src/security');
const { resetRateLimitMemory } = require('../src/security/apiRateLimit');
const { PLATFORM_FEATURES, getFeatureById, parseEnvBoolean } = require('../src/platform/featureRegistry');

const app = require('../app');

describe('secret redaction', () => {
    test('redacts API keys and JWTs from strings', () => {
        const raw = 'Bearer sk-abc1234567890 and eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb';
        const cleaned = redactSecrets(raw);
        assert.match(cleaned, /\[redacted\]/);
        assert.doesNotMatch(cleaned, /sk-abc/);
        assert.doesNotMatch(cleaned, /eyJhbGci/);
    });

    test('redacts nested object secrets', () => {
        const cleaned = redactObject({
            password: 'secret',
            api_key: 'sk-live-xxx',
            nested: { token: 'abc', ok: true },
        });
        assert.equal(cleaned.password, '[redacted]');
        assert.equal(cleaned.api_key, '[redacted]');
        assert.equal(cleaned.nested.token, '[redacted]');
        assert.equal(cleaned.nested.ok, true);
    });

    test('admin metadata strips private message fields', () => {
        const cleaned = sanitizeAdminMetadata({
            message: 'private chat text',
            prompt: 'do not store',
            path: '/admin/users',
            count: 2,
        });
        assert.equal(cleaned.message, undefined);
        assert.equal(cleaned.prompt, undefined);
        assert.equal(cleaned.path, '/admin/users');
        assert.equal(cleaned.count, 2);
    });
});

describe('security headers', () => {
    test('API responses include nosniff and frame deny headers', async () => {
        const res = await request(app).get('/api/health').catch(() => null);
        // health may 404 depending on routes; hit a known public endpoint
        const probe = res?.status
            ? res
            : await request(app).get('/api/public/firebase-config');
        assert.ok(probe.status < 500);
        assert.equal(probe.headers['x-content-type-options'], 'nosniff');
        assert.equal(probe.headers['x-frame-options'], 'DENY');
        assert.equal(probe.headers['referrer-policy'], 'strict-origin-when-cross-origin');
        assert.equal(probe.headers['cache-control'], 'no-store');
    });
});

describe('CSRF guard', () => {
    test('rejects cookie-authenticated POST from disallowed origin', async () => {
        const email = `csrf-${Date.now()}@example.com`;
        const password = 'CsrfTestPass1';
        const agent = request.agent(app);
        assert.equal(
            (await agent.post('/api/auth/register').send({ name: 'CSRF', email, password })).status,
            201,
        );
        assert.equal(
            (await agent.post('/api/auth/login').send({ email, password })).status,
            200,
        );

        const blocked = await agent
            .post('/api/auth/logout')
            .set('Origin', 'https://evil.example')
            .send({});
        assert.equal(blocked.status, 403);
        assert.equal(blocked.body.code, 'CSRF_REJECTED');
    });

    test('allows Bearer API-key style Authorization without Origin check path', async () => {
        // Without a session cookie, CSRF middleware should pass through.
        const res = await request(app)
            .post('/api/chat')
            .set('Origin', 'https://evil.example')
            .send({ message: 'hi' });
        // Unauthenticated → 401 from requireAuth, not 403 CSRF
        assert.equal(res.status, 401);
        assert.notEqual(res.body.code, 'CSRF_REJECTED');
    });
});

describe('admin audit', () => {
    test('requireAdmin writes an admin_audit_logs row without message content', async () => {
        const db = app.locals.db.database;
        const before = db.prepare('SELECT COUNT(*) AS n FROM admin_audit_logs').get().n;
        // Admin-key-only route (no session requireAuth) so audit middleware always runs.
        const res = await request(app)
            .get('/api/admin/ops/dashboard')
            .set('x-admin-key', 'test-admin-key-phase1');
        assert.notEqual(res.status, 401);
        const after = db.prepare('SELECT COUNT(*) AS n FROM admin_audit_logs').get().n;
        assert.ok(after >= before + 1);
        const latest = db.prepare(
            'SELECT action, metadata FROM admin_audit_logs ORDER BY id DESC LIMIT 1',
        ).get();
        assert.match(String(latest.action), /admin\/ops/i);
        const meta = JSON.parse(latest.metadata || '{}');
        assert.equal(meta.message, undefined);
        assert.equal(meta.messages, undefined);
    });
});

describe('rate limiting', () => {
    test('IP rate limit returns 429 after burst', async () => {
        await resetRateLimitMemory(app.locals.cache);
        process.env.ENABLE_API_RATE_LIMIT = 'true';
        let saw429 = false;
        for (let i = 0; i < 12; i += 1) {
            const res = await request(app).get('/api/public/firebase-config');
            if (res.status === 429) {
                saw429 = true;
                assert.equal(res.body.code, 'RATE_LIMIT');
                assert.ok(res.headers['retry-after']);
                break;
            }
        }
        assert.equal(saw429, true);
        await resetRateLimitMemory(app.locals.cache);
    });
});

describe('feature flags', () => {
    test('new Phase feature flags are registered', () => {
        for (const id of [
            'ai_fallback',
            'ai_file_manager',
            'ai_workflows',
            'ai_evaluation_lab',
            'ollama_local',
            'billing_live_checkout',
        ]) {
            assert.ok(getFeatureById(id), `missing feature ${id}`);
        }
        assert.ok(PLATFORM_FEATURES.length >= 12);
        assert.equal(parseEnvBoolean('FEATURE_AI_FALLBACK', true), true);
    });
});

describe('validation helpers', () => {
    test('assertString enforces length bounds', () => {
        const { assertString } = require('../src/security/validateRequest');
        assert.throws(
            () => assertString('x'.repeat(20), { field: 'name', max: 5 }),
            /length must be between/,
        );
        assert.equal(assertString('  hello  ', { field: 'name', max: 20 }), 'hello');
    });
});
