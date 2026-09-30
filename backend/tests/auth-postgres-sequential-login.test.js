const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { loadAuthUserByEmailAsync } = require('../src/authUser');
const { hashPassword } = require('../src/password');
const { pgQueryText, pgQueryValues } = require('./pgQueryArgs');

process.env.NODE_ENV = 'test';

test('loadAuthUserByEmailAsync resolves after await without blocking (postgres pool)', async () => {
    const rows = {
        'user@example.com': {
            id: 9,
            name: 'Nikita',
            email: 'user@example.com',
            password_hash: 'salt:hex',
            avatar_url: null,
        },
    };
    let queryCount = 0;
    const mockPool = {
        query: async (configOrText, values) => {
            const text = pgQueryText(configOrText);
            const queryValues = pgQueryValues(configOrText, values);
            queryCount += 1;
            await Promise.resolve();
            assert.match(text, /lower\(trim\(email\)\)/i);
            const row = rows[queryValues[0]];
            return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
        },
    };
    const connection = { engine: 'postgres', pgAsyncPool: mockPool, database: { pool: mockPool } };

    await Promise.resolve();
    const first = await loadAuthUserByEmailAsync(connection, 'user@example.com');
    assert.equal(first.id, 9);

    await Promise.resolve();
    const second = await loadAuthUserByEmailAsync(connection, 'user@example.com');
    assert.equal(second.id, 9);

    await Promise.resolve();
    const third = await loadAuthUserByEmailAsync(connection, 'missing@example.com');
    assert.equal(third, null);

    assert.equal(queryCount, 3);
});

test('three sequential POST /api/auth/login succeed on postgres async path', async () => {
    const password = 'SequentialLogin123!';
    const passwordHash = await hashPassword(password);
    const email = 'sequential-pg@example.com';

    const userRow = {
        id: 77,
        name: 'Sequential User',
        email,
        password_hash: passwordHash,
        avatar_url: null,
    };

    let lookupCalls = 0;
    let sessionInserts = 0;
    const mockPool = {
        query: async (configOrText, values) => {
            const text = pgQueryText(configOrText);
            const queryValues = pgQueryValues(configOrText, values);
            await Promise.resolve();
            if (/FROM users/i.test(text) && /lower\(trim\(email\)\)/i.test(text)) {
                lookupCalls += 1;
                if (queryValues[0] === email) {
                    return { rows: [userRow], rowCount: 1 };
                }
                return { rows: [], rowCount: 0 };
            }
            if (/INSERT INTO auth_sessions/i.test(text)) {
                sessionInserts += 1;
                return { rowCount: 1, rows: [] };
            }
            if (/UPDATE users SET name/i.test(text)) {
                userRow.name = queryValues[0];
                return { rowCount: 1, rows: [] };
            }
            throw new Error(`Unexpected postgres query: ${text.slice(0, 80)}`);
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
        for (let attempt = 1; attempt <= 3; attempt += 1) {
            const login = await request(app)
                .post('/api/auth/login')
                .send({ email, password })
                .timeout({ deadline: 5000 });
            assert.equal(login.status, 200, `attempt ${attempt}: ${login.body?.message}`);
            assert.equal(login.body.user.email, email);
            assert.ok(login.headers['set-cookie'], `attempt ${attempt} cookie`);
        }
        assert.equal(lookupCalls, 3);
        assert.equal(sessionInserts, 3);
    } finally {
        app.locals.db = originalDb;
    }
});
