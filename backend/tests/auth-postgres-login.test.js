const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const {
    mapAuthUserRow,
    classifyPasswordHashType,
    isValidPasswordHashFormat,
} = require('../src/authPasswordHash');
const { loadAuthUserByEmail } = require('../src/authUser');
const { hashPassword, verifyPassword } = require('../src/password');
const { normalizeLoginEmail } = require('../src/authHelpers');

test('mapAuthUserRow reads PostgreSQL lowercase passwordhash column', () => {
    const user = mapAuthUserRow({
        id: 9,
        name: 'Nikita',
        email: 'hrybovnikita@gmail.com',
        passwordhash: '2199f60abc:deadbeef',
        avatar_url: null,
    });
    assert.equal(user.passwordHash, '2199f60abc:deadbeef');
});

test('classifyPasswordHashType detects scrypt imported hashes', () => {
    assert.equal(classifyPasswordHashType('2199f60:abc123'), 'scrypt');
    assert.equal(isValidPasswordHashFormat('2199f60:abc123'), true);
});

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-pg-login-${process.pid}-${Date.now()}.sqlite`);
const app = require('../app');

test('PostgreSQL login succeeds with imported scrypt hash column mapping', async () => {
    const password = 'ProductionTest123!';
    const passwordHash = await hashPassword(password);
    const db = app.locals.db.database;
    db.prepare('INSERT INTO users (id, name, email, password_hash, email_verified) VALUES (?, ?, ?, ?, 1)').run(
        9,
        'Nikita Hrybov',
        'hrybovnikita@gmail.com',
        passwordHash,
    );

    const row = db.prepare('SELECT id, name, email, password_hash, avatar_url FROM users WHERE id = 9').get();
    const mapped = mapAuthUserRow({ ...row, passwordhash: row.password_hash });
    assert.ok(mapped.passwordHash);

    const login = await request(app)
        .post('/api/auth/login')
        .send({
            email: 'hrybovnikita@gmail.com',
            password,
        });
    assert.equal(login.status, 200, login.body?.message);
    assert.equal(login.body.user.email, 'hrybovnikita@gmail.com');
    assert.ok(login.headers['set-cookie']);

    const wrong = await request(app)
        .post('/api/auth/login')
        .send({
            email: 'hrybovnikita@gmail.com',
            password: 'WrongPassword123!',
        });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.message, 'Incorrect email or password');

    const missing = await request(app)
        .post('/api/auth/login')
        .send({
            email: 'missing@example.com',
            password: 'ProductionTest123!',
        });
    assert.equal(missing.status, 401);

});

test('loadAuthUserByEmail uses normalized email lookup', () => {
    const calls = [];
    const database = {
        prepare(sql) {
            return {
                get(email) {
                    calls.push({ sql, email });
                    if (email === normalizeLoginEmail('HrybovNikita@gmail.com')) {
                        return {
                            id: 9,
                            name: 'Nikita',
                            email: 'hrybovnikita@gmail.com',
                            password_hash: 'abc:def',
                            avatar_url: null,
                        };
                    }
                    return undefined;
                },
            };
        },
    };
    const user = loadAuthUserByEmail(database, normalizeLoginEmail('HrybovNikita@gmail.com'));
    assert.equal(user.id, 9);
    assert.equal(user.passwordHash, 'abc:def');
    assert.match(calls[0].sql, /lower\(trim\(email\)\)/);
});
