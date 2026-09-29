const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const { hashPassword } = require('../src/password');
const { safeSessionErrorCode } = require('../src/authSessionStore');

process.env.NODE_ENV = 'test';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'allmodelai-login-fail-'));
process.env.DB_FILE = path.join(directory, 'database.sqlite');
const app = require('../app');

after(() => {
    app.locals.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
});

test('safeSessionErrorCode maps postgres failures without leaking internals', () => {
    assert.equal(safeSessionErrorCode({ code: '23505' }), 'SESSION_DUPLICATE');
    assert.equal(safeSessionErrorCode({ code: '23503' }), 'SESSION_USER_FK');
    assert.equal(safeSessionErrorCode({ code: 'XX000' }), 'SESSION_DB_ERROR');
});

test('login returns controlled 500 when auth_sessions insert fails', async () => {
    const password = 'ControlledFail123!';
    const passwordHash = await hashPassword(password);
    const db = app.locals.db.database;
    db.prepare('INSERT INTO users (id, name, email, password_hash, email_verified) VALUES (?, ?, ?, ?, 1)').run(
        44,
        'Controlled Fail',
        'controlled-fail@example.com',
        passwordHash,
    );

    const originalPrepare = db.prepare.bind(db);
    db.prepare = (sql) => {
        const statement = originalPrepare(sql);
        if (/INSERT INTO auth_sessions/i.test(sql)) {
            return {
                get: (...args) => statement.get(...args),
                all: (...args) => statement.all(...args),
                run: () => {
                    const error = new Error('constraint');
                    error.code = '23505';
                    throw error;
                },
            };
        }
        return statement;
    };

    try {
        const login = await request(app)
            .post('/api/auth/login')
            .send({ email: 'controlled-fail@example.com', password });
        assert.equal(login.status, 500);
        assert.equal(login.body.code, 'SESSION_CREATION_FAILED');
        assert.match(login.body.message, /Could not complete sign-in/i);
    } finally {
        db.prepare = originalPrepare;
    }
});
