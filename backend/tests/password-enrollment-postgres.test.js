const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const { hashToken } = require('../src/sessionAuth');
const { createSessionToken } = require('../src/sessionToken');
const { createPostgresHttpMockPool, attachPostgresAppDb } = require('./pgMockPool');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
process.env.DB_FILE = require('node:path').join(
    require('node:os').tmpdir(),
    `allmodelai-pg-pwd-${process.pid}-${Date.now()}.sqlite`,
);

const app = require('../app');

test('PostgreSQL password enroll updates by user id and keeps session for Google-only accounts', async () => {
    const email = 'google-pg-enroll@example.com';
    const mockPool = createPostgresHttpMockPool({
        id: 501,
        name: 'Google PG User',
        email,
        password_hash: null,
        avatar_url: null,
    }, { trackSocial: true });
    mockPool.socialIdentities.set('google.com:sub-501', {
        provider: 'google.com',
        subject: 'sub-501',
        user_id: 501,
    });

    const db = attachPostgresAppDb(app, mockPool);
    const expiresAt = Date.now() + 60_000;
    const token = createSessionToken(501, expiresAt);
    mockPool.sessions.set(hashToken(token), { userId: 501, expiresAt });

    try {
        const security = await request(app)
            .get('/api/auth/account/security')
            .set('Cookie', `allmodelai_session=${token}`);
        assert.equal(security.status, 200);
        assert.equal(security.body.passwordEnabled, false);
        assert.ok(security.body.providers.includes('google.com'));

        const enrolled = await request(app)
            .post('/api/auth/account/password')
            .set('Cookie', `allmodelai_session=${token}`)
            .send({
                newPassword: 'pg-enroll-password-1',
                confirmPassword: 'pg-enroll-password-1',
            });
        assert.equal(enrolled.status, 200, JSON.stringify(enrolled.body));
        assert.equal(enrolled.body.passwordEnabled, true);
        assert.equal(enrolled.body.sessionRevoked, false);
        assert.ok(mockPool.userRow.password_hash);

        const sessionAfter = await request(app)
            .get('/api/auth/account/security')
            .set('Cookie', `allmodelai_session=${token}`);
        assert.equal(sessionAfter.status, 200);
        assert.equal(sessionAfter.body.passwordEnabled, true);

        const login = await request(app).post('/api/auth/login').send({
            email,
            password: 'pg-enroll-password-1',
        });
        assert.equal(login.status, 200);
        assert.equal(login.body.user.id, 501);
    } finally {
        db.restore();
    }
});

after(() => {
    app.locals.cache?.close?.();
    app.locals.db?.close?.();
});
