const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createPostgresHttpMockPool, attachPostgresAppDb } = require('./pgMockPool');

process.env.NODE_ENV = 'test';

test('postgres register → logout → login uses the same stored password hash', async () => {
    const mockPool = createPostgresHttpMockPool({
        id: 9000,
        name: 'Internal Seed',
        email: 'seed@internal.local',
        password_hash: 'seed:00',
        avatar_url: null,
    });
    const app = require('../app');
    const db = attachPostgresAppDb(app, mockPool);

    const email = 'register-logout-login@example.com';
    const password = 'RegisterLogout1';
    const agent = request.agent(app);

    try {
        const registered = await agent.post('/api/auth/register').send({
            name: 'Register Logout User',
            email,
            password,
            rememberMe: true,
        });
        assert.equal(registered.status, 201, registered.body?.message);

        const logout = await agent.post('/api/auth/logout');
        assert.equal(logout.status, 204);

        const login = await request(app)
            .post('/api/auth/login')
            .set('Origin', 'https://all-model-ai.vercel.app')
            .send({ email, password, rememberMe: true });
        assert.equal(login.status, 200, login.body?.message);
        assert.equal(login.body.user.email, email);
        assert.ok(
            login.body.nativeSessionToken || login.headers['set-cookie'],
            'cross-site login should return native token and/or Set-Cookie',
        );

        const me = await request(app)
            .get('/api/auth/me')
            .set('Origin', 'https://all-model-ai.vercel.app')
            .set('X-AllModelAI-Session', login.body.nativeSessionToken || '');
        assert.equal(me.status, 200);
        assert.equal(me.body.user.email, email);
    } finally {
        db.restore();
    }
});
