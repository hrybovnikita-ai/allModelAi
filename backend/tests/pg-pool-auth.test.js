const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { loadAuthUserByEmailAsync } = require('../src/authUser');
const { hashPassword } = require('../src/password');
const { queryPgPool } = require('../src/db/pgPoolQuery');
const { pgQueryText, pgQueryValues } = require('./pgQueryArgs');

process.env.NODE_ENV = 'test';

test('auth lookup succeeds after repeated timed-out queries on the same mock pool', async () => {
    let inFlight = 0;
    let failCount = 0;
    const email = 'recover@example.com';
    const pool = {
        totalCount: 1,
        idleCount: 1,
        waitingCount: 0,
        query: (config) => new Promise((resolve, reject) => {
            inFlight += 1;
            const delay = Math.min(config.query_timeout || 40, 40);
            setTimeout(() => {
                inFlight -= 1;
                if (failCount < 2) {
                    failCount += 1;
                    reject(new Error('Query read timeout'));
                    return;
                }
                resolve({
                    rows: [{
                        id: 12,
                        name: 'Recovered',
                        email,
                        password_hash: 'a:b',
                        avatar_url: null,
                    }],
                    rowCount: 1,
                });
            }, delay);
        }),
    };

    await assert.rejects(
        () => queryPgPool(pool, 'SELECT 1 FROM users', [email], { timeoutMs: 25 }),
        (error) => /timeout/i.test(error.message),
    );
    await assert.rejects(
        () => queryPgPool(pool, 'SELECT 1 FROM users', [email], { timeoutMs: 25 }),
        (error) => /timeout/i.test(error.message),
    );
    assert.equal(inFlight, 0);

    const user = await loadAuthUserByEmailAsync(
        { engine: 'postgres', pgAsyncPool: pool, database: { pool } },
        email,
    );
    assert.equal(user.id, 12);
});

test('loadAuthUserByEmailAsync uses pgAsyncPool when primary pool is blocked', async () => {
    const row = {
        id: 3,
        name: 'Blocked Primary',
        email: 'blocked@example.com',
        password_hash: 'a:b',
        avatar_url: null,
    };
    const authPool = {
        query: async (configOrText, values) => {
            const text = pgQueryText(configOrText);
            const queryValues = pgQueryValues(configOrText, values);
            assert.match(text, /FROM users/i);
            assert.equal(queryValues[0], 'blocked@example.com');
            return { rows: [row], rowCount: 1 };
        },
    };
    const blockedPrimaryPool = {
        query: () => new Promise(() => {}),
    };
    const user = await loadAuthUserByEmailAsync(
        {
            engine: 'postgres',
            pgAsyncPool: authPool,
            database: { pool: blockedPrimaryPool },
        },
        'blocked@example.com',
    );
    assert.equal(user.id, 3);
});

test('ten sequential login/session/models cycles complete on postgres async pool', async () => {
    const password = 'CycleTest123!';
    const passwordHash = await hashPassword(password);
    const email = 'cycle-test@example.com';
    const userRow = {
        id: 88,
        name: 'Cycle User',
        email,
        password_hash: passwordHash,
        avatar_url: null,
    };
    const sessions = new Map();

    const mockPool = {
        query: async (configOrText, values) => {
            const text = pgQueryText(configOrText);
            const queryValues = pgQueryValues(configOrText, values);
            await Promise.resolve();
            if (/INSERT INTO auth_sessions/i.test(text)) {
                sessions.set(queryValues[0], { userId: queryValues[1], expiresAt: Number(queryValues[2]) });
                return { rowCount: 1, rows: [] };
            }
            if (/FROM users/i.test(text) && /lower\(trim\(email\)\)/i.test(text)) {
                return queryValues[0] === email
                    ? { rows: [userRow], rowCount: 1 }
                    : { rows: [], rowCount: 0 };
            }
            if (/auth_sessions JOIN users/i.test(text)) {
                const session = sessions.get(queryValues[0]);
                if (!session || session.expiresAt <= Number(queryValues[1])) {
                    return { rows: [], rowCount: 0 };
                }
                return {
                    rows: [{
                        id: userRow.id,
                        name: userRow.name,
                        email: userRow.email,
                        avatar: null,
                    }],
                    rowCount: 1,
                };
            }
            if (/UPDATE users SET name/i.test(text)) {
                return { rowCount: 1, rows: [] };
            }
            throw new Error(`Unexpected query: ${text.slice(0, 80)}`);
        },
    };

    const app = require('../app');
    const originalDb = app.locals.db;
    app.locals.db = {
        engine: 'postgres',
        pgAsyncPool: mockPool,
        database: { pool: mockPool },
    };

    const deadline = { deadline: 8000 };

    try {
        for (let cycle = 1; cycle <= 10; cycle += 1) {
            const login = await request(app)
                .post('/api/auth/login')
                .send({ email, password })
                .timeout(deadline);
            assert.equal(login.status, 200, `login cycle ${cycle}`);

            const cookie = login.headers['set-cookie']?.[0]?.split(';')[0];
            const session = await request(app)
                .get('/api/auth/session')
                .set('Cookie', cookie)
                .timeout(deadline);
            assert.equal(session.status, 200, `session cycle ${cycle}`);

            const models = await request(app).get('/api/status/models').timeout(deadline);
            assert.equal(models.status, 200, `models cycle ${cycle}`);
        }
    } finally {
        app.locals.db = originalDb;
    }
});

test('concurrent login lookups and model status requests terminate', async () => {
    const password = 'Concurrent123!';
    const passwordHash = await hashPassword(password);
    const email = 'concurrent@example.com';
    let inFlight = 0;
    let maxInFlight = 0;

    const mockPool = {
        query: async (configOrText, values) => {
            const text = pgQueryText(configOrText);
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await Promise.resolve();
            inFlight -= 1;
            if (/FROM users/i.test(text)) {
                return {
                    rows: [{
                        id: 1,
                        name: 'C',
                        email,
                        password_hash: passwordHash,
                        avatar_url: null,
                    }],
                    rowCount: 1,
                };
            }
            if (/INSERT INTO auth_sessions/i.test(text)) {
                return { rowCount: 1, rows: [] };
            }
            if (/auth_sessions JOIN users/i.test(text)) {
                return { rows: [], rowCount: 0 };
            }
            if (/UPDATE users SET name/i.test(text)) {
                return { rowCount: 1, rows: [] };
            }
            throw new Error(`Unexpected: ${text.slice(0, 60)}`);
        },
    };

    const app = require('../app');
    const originalDb = app.locals.db;
    app.locals.db = {
        engine: 'postgres',
        pgAsyncPool: mockPool,
        database: { pool: mockPool },
    };

    try {
        const tasks = [];
        for (let i = 0; i < 5; i += 1) {
            tasks.push(request(app).post('/api/auth/login').send({ email, password }).timeout({ deadline: 8000 }));
            tasks.push(request(app).get('/api/status/models').timeout({ deadline: 8000 }));
        }
        const results = await Promise.all(tasks);
        for (const result of results) {
            assert.ok([200, 401, 503].includes(result.status), `unexpected hang status ${result.status}`);
        }
        assert.ok(maxInFlight >= 1);
    } finally {
        app.locals.db = originalDb;
    }
});
