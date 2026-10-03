const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { hashPassword } = require('../src/password');
const { pgQueryText, pgQueryValues } = require('./pgQueryArgs');

process.env.NODE_ENV = 'test';

function createMockPostgresPool(initialUser) {
    const sessions = new Map();
    const userRow = { ...initialUser };

    return {
        sessions,
        query: async (configOrText, values) => {
            const text = pgQueryText(configOrText);
            const queryValues = pgQueryValues(configOrText, values);
            await Promise.resolve();
            if (/INSERT INTO auth_sessions/i.test(text)) {
                sessions.set(queryValues[0], { userId: queryValues[1], expiresAt: Number(queryValues[2]) });
                return { rowCount: 1, rows: [] };
            }
            if (/FROM users/i.test(text) && /lower\(trim\(email\)\)/i.test(text)) {
                if (queryValues[0] === userRow.email) {
                    return { rows: [userRow], rowCount: 1 };
                }
                return { rows: [], rowCount: 0 };
            }
            if (/auth_sessions JOIN users/i.test(text)) {
                const session = sessions.get(queryValues[0]);
                if (!session || session.expiresAt <= Number(queryValues[1])) {
                    return { rows: [], rowCount: 0 };
                }
                if (session.userId !== userRow.id) {
                    return { rows: [], rowCount: 0 };
                }
                return {
                    rows: [{
                        id: userRow.id,
                        name: userRow.name,
                        email: userRow.email,
                        avatar: userRow.avatar_url || null,
                    }],
                    rowCount: 1,
                };
            }
            if (/UPDATE users SET name/i.test(text)) {
                userRow.name = queryValues[0];
                return { rowCount: 1, rows: [] };
            }
            if (/SELECT id,\s*name(\s*,\s*email)?\s*FROM users/i.test(text)) {
                return {
                    rows: [{ id: userRow.id, name: userRow.name, email: userRow.email }],
                    rowCount: 1,
                };
            }
            throw new Error(`Unexpected postgres query: ${text.slice(0, 96)}`);
        },
    };
}

test('auth login, session, and model status complete sequentially on postgres async path', async () => {
    const password = 'ProdPathTest123!';
    const passwordHash = await hashPassword(password);
    const email = 'prod-path@example.com';
    const mockPool = createMockPostgresPool({
        id: 501,
        name: 'Prod Path',
        email,
        password_hash: passwordHash,
        avatar_url: null,
    });

    const app = require('../app');
    const originalDb = app.locals.db;
    app.locals.db = {
        engine: 'postgres',
        pgAsyncPool: mockPool,
        database: { pool: mockPool },
    };

    const deadline = { deadline: 8000 };

    try {
        const login1 = await request(app)
            .post('/api/auth/login')
            .send({ email, password })
            .timeout(deadline);
        assert.equal(login1.status, 200, login1.body?.message);
        const cookie1 = login1.headers['set-cookie']?.[0]?.split(';')[0];
        assert.ok(cookie1);

        const session1 = await request(app)
            .get('/api/auth/session')
            .set('Cookie', cookie1)
            .timeout(deadline);
        assert.equal(session1.status, 200);
        assert.equal(session1.body.user.email, email);

        const models1 = await request(app).get('/api/status/models').timeout(deadline);
        assert.equal(models1.status, 200);
        assert.ok(models1.body.models);

        const login2 = await request(app)
            .post('/api/auth/login')
            .send({ email, password })
            .timeout(deadline);
        assert.equal(login2.status, 200);

        const cookie2 = login2.headers['set-cookie']?.[0]?.split(';')[0];
        const session2 = await request(app)
            .get('/api/auth/session')
            .set('Cookie', cookie2)
            .timeout(deadline);
        assert.equal(session2.status, 200);

        const community = await request(app).get('/api/community/users').timeout(deadline);
        assert.equal(community.status, 200);
        assert.ok(Array.isArray(community.body.users));
        assert.ok(community.body.users.length >= 1);

        const checkout = await request(app).get('/api/payments/checkout-info').timeout(deadline);
        assert.equal(checkout.status, 200);
        assert.ok(checkout.body);

        const models2 = await request(app).get('/api/status/models').timeout(deadline);
        assert.equal(models2.status, 200);
    } finally {
        app.locals.db = originalDb;
    }
});

test('getSession postgres path uses pool.query only (no database.prepare)', async () => {
    let prepareCalls = 0;
    let poolQueries = 0;
    const mockPool = {
        query: async (configOrText) => {
            const text = pgQueryText(configOrText);
            poolQueries += 1;
            assert.match(text, /auth_sessions JOIN users/i);
            return {
                rows: [{
                    id: 1,
                    name: 'Test',
                    email: 'test@example.com',
                    avatar: null,
                }],
                rowCount: 1,
            };
        },
    };
    const app = require('../app');
    const originalDb = app.locals.db;
    app.locals.db = {
        engine: 'postgres',
        pgAsyncPool: mockPool,
        database: {
            pool: mockPool,
            prepare() {
                prepareCalls += 1;
                return { get: () => null };
            },
        },
    };

    try {
        const { createSessionToken } = require('../src/sessionToken');
        const token = createSessionToken(1, Date.now() + 60_000);
        const response = await request(app)
            .get('/api/auth/session')
            .set('Cookie', `allmodelai_session=${encodeURIComponent(token)}`)
            .timeout({ deadline: 5000 });
        assert.equal(response.status, 200);
        assert.equal(prepareCalls, 0);
        assert.equal(poolQueries, 1);
    } finally {
        app.locals.db = originalDb;
    }
});
