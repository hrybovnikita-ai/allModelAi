const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { hashPassword } = require('../src/password');
const { createPostgresHttpMockPool, attachPostgresAppDb } = require('./pgMockPool');

process.env.NODE_ENV = 'test';

test('postgres HTTP guard blocks sync adapter across core API routes', async () => {
    const password = 'GuardTest123!';
    const passwordHash = await hashPassword(password);
    const email = 'guard-test@example.com';
    const mockPool = createPostgresHttpMockPool({
        id: 777,
        name: 'Guard',
        email,
        password_hash: passwordHash,
        avatar_url: null,
    });

    const app = require('../app');
    const db = attachPostgresAppDb(app, mockPool, { trapSyncPrepare: true });
    const deadline = { deadline: 8000 };

    try {
        const register = await request(app)
            .post('/api/auth/register')
            .send({ name: 'Guard', email: 'guard-new@example.com', password: 'GuardNew123!', confirmPassword: 'GuardNew123!' })
            .timeout(deadline);
        assert.ok([201, 409].includes(register.status));

        const login = await request(app).post('/api/auth/login').send({ email, password }).timeout(deadline);
        assert.equal(login.status, 200);
        const cookie = login.headers['set-cookie']?.[0]?.split(';')[0];

        const getRoutes = [
            ['/api/auth/session', cookie],
            ['/api/subscription', cookie],
            ['/api/credits', cookie],
            ['/api/chat/history', cookie],
            ['/api/analytics', cookie],
            ['/api/workspace?type=project', cookie],
            ['/api/status/models', null],
            ['/api/health', null],
            ['/api/search?q=hello', cookie],
            ['/api/jobs', cookie],
            ['/api/storage/ideas', cookie],
            ['/api/developer/keys', cookie],
            ['/api/teams', cookie],
            ['/api/usage/report', cookie],
            ['/api/audit', cookie],
        ];

        for (const [path, cookieHeader] of getRoutes) {
            const agent = request(app).get(path).timeout(deadline);
            if (cookieHeader) agent.set('Cookie', cookie);
            const response = await agent;
            assert.ok(response.status < 500, `GET ${path} failed with ${response.status}`);
        }

        const workspacePost = await request(app)
            .post('/api/workspace')
            .set('Cookie', cookie)
            .send({ type: 'project', name: 'Guard project' })
            .timeout(deadline);
        assert.ok(workspacePost.status < 500, `POST workspace ${workspacePost.status}`);

        const logout = await request(app).post('/api/auth/logout').set('Cookie', cookie).timeout(deadline);
        assert.ok(logout.status === 204 || logout.status === 200, `logout ${logout.status}`);

        assert.equal(db.getSyncViolationCount(), 0);
    } finally {
        db.restore();
    }
});
