const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const { insertAuthSession, syncLoginUserName } = require('../src/authSessionStore');
const { hashPassword } = require('../src/password');
const { pgQueryText, pgQueryValues } = require('./pgQueryArgs');

process.env.NODE_ENV = 'test';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'allmodelai-auth-session-'));
process.env.DB_FILE = path.join(directory, 'database.sqlite');
const app = require('../app');

test('insertAuthSession uses async pool.query after await on postgres engine', async () => {
    let queryCalls = 0;
    const mockPool = {
        query: async (configOrText, values) => {
            const text = pgQueryText(configOrText);
            const queryValues = pgQueryValues(configOrText, values);
            queryCalls += 1;
            assert.match(text, /INSERT INTO auth_sessions/i);
            assert.equal(queryValues.length, 3);
            return { rowCount: 1, rows: [] };
        },
    };
    await Promise.resolve();
    await insertAuthSession(
        { engine: 'postgres', pgAsyncPool: mockPool, database: { pool: mockPool } },
        'test-token-hash',
        9,
        Date.now() + 60_000,
    );
    assert.equal(queryCalls, 1);
});

test('login stores auth_sessions row and returns session cookie after password verify', async () => {
    const password = 'SessionStoreTest123!';
    const passwordHash = await hashPassword(password);
    const db = app.locals.db.database;
    db.prepare('INSERT INTO users (id, name, email, password_hash, email_verified) VALUES (?, ?, ?, ?, 1)').run(
        42,
        'Session Tester',
        'session-store@example.com',
        passwordHash,
    );

    const login = await request(app)
        .post('/api/auth/login')
        .send({ email: 'session-store@example.com', password });
    assert.equal(login.status, 200, login.body?.message);
    assert.ok(login.headers['set-cookie']);

    const tokenHashRow = db.prepare(
        'SELECT token_hash, user_id, expires_at FROM auth_sessions WHERE user_id = ?',
    ).get(42);
    assert.ok(tokenHashRow);
    assert.equal(tokenHashRow.user_id, 42);
    assert.ok(Number(tokenHashRow.expires_at) > Date.now());

    const cookie = login.headers['set-cookie'][0].split(';')[0];
    const session = await request(app).get('/api/auth/session').set('Cookie', cookie);
    assert.equal(session.status, 200);
    assert.equal(session.body.user.email, 'session-store@example.com');
});

test('insertAuthSession propagates postgres errors for login error handling', async () => {
    const mockPool = {
        query: async () => {
            const error = new Error('duplicate');
            error.code = '23505';
            throw error;
        },
    };
    await assert.rejects(
        () => insertAuthSession(
            { engine: 'postgres', pgAsyncPool: mockPool, database: { pool: mockPool } },
            'hash',
            1,
            Date.now() + 1000,
        ),
        (error) => error.code === '23505',
    );
});

test('syncLoginUserName uses async pool.query for postgres after await', async () => {
    let updated = false;
    const mockPool = {
        query: async (configOrText, values) => {
            const text = pgQueryText(configOrText);
            const queryValues = pgQueryValues(configOrText, values);
            assert.match(text, /UPDATE users SET name/i);
            assert.equal(queryValues[0], 'New Name');
            assert.equal(queryValues[1], 9);
            updated = true;
            return { rowCount: 1, rows: [] };
        },
    };
    await Promise.resolve();
    const account = { id: 9, name: 'Old' };
    const result = await syncLoginUserName(
        { engine: 'postgres', pgAsyncPool: mockPool, database: { pool: mockPool } },
        account,
        'New Name',
        [],
    );
    assert.equal(result.name, 'New Name');
    assert.equal(updated, true);
});
