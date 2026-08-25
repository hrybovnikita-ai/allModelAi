const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

process.env.DB_FILE = path.join(os.tmpdir(), 'allmodelai-users-test.sqlite');
fs.rmSync(process.env.DB_FILE, { force: true });

const app = require('../app');
const users = require('../src/data/data');

const originalUsers = users.map((user) => ({ ...user }));

describe('AllModelAI users API', () => {
    beforeEach(() => {
        users.splice(0, users.length, ...originalUsers.map((user) => ({ ...user })));
        const data = app.locals.db.read();
        data.conversations = [];
        app.locals.db.write(data);
    });

    test('GET / returns the API status', async () => {
        const response = await request(app).get('/');
        assert.equal(response.status, 200);
        assert.equal(response.body.message, 'AllModelAI API is running');
    });

    test('social auth lists and signs in with a provider account', async () => {
        const accounts = await request(app).get('/api/auth/google/accounts');
        assert.equal(accounts.status, 200);
        assert.equal(accounts.body.provider, 'Google');
        assert.equal(accounts.body.accounts[0].email, 'alice.johnson@gmail.com');
        const response = await request(app).post('/api/auth/social').send({ provider: 'google', accountId: accounts.body.accounts[0].id });
        assert.equal(response.status, 200);
        assert.equal(response.body.user.name, 'Alice Johnson');
        assert.equal(response.body.user.provider, 'Google');
    });

    test('registration stores a password securely and login verifies it', async () => {
        const registration = await request(app).post('/api/auth/register').send({
            name: 'Nikita Hrybov', email: 'nikita.auth@example.com', password: 'StrongPass123',
        });
        assert.equal(registration.status, 201);
        assert.equal(registration.body.user.email, 'nikita.auth@example.com');
        assert.equal(registration.body.user.passwordHash, undefined);
        assert.deepEqual(registration.body.welcomeEmail, { sent: false, reason: 'not_configured' });
        const stored = users.find((user) => user.email === 'nikita.auth@example.com');
        assert.notEqual(stored.passwordHash, 'StrongPass123');

        const wrongPassword = await request(app).post('/api/auth/login').send({ email: 'nikita.auth@example.com', password: 'WrongPass123' });
        assert.equal(wrongPassword.status, 401);
        const login = await request(app).post('/api/auth/login').send({ email: 'nikita.auth@example.com', password: 'StrongPass123' });
        assert.equal(login.status, 200);
        assert.equal(login.body.user.passwordHash, undefined);
    });

    test('registration accepts a short non-empty password', async () => {
        const registration = await request(app).post('/api/auth/register').send({
            name: 'Short Password', email: 'short-password@example.com', password: '1',
        });
        assert.equal(registration.status, 201);
        const login = await request(app).post('/api/auth/login').send({ email: 'short-password@example.com', password: '1' });
        assert.equal(login.status, 200);
    });

    test('registration adds a password to an existing passwordless account', async () => {
        const passwordless = users.find((user) => !user.passwordHash);
        assert.ok(passwordless);
        const registration = await request(app).post('/api/auth/register').send({
            name: passwordless.name, email: passwordless.email, password: 'new',
        });
        assert.equal(registration.status, 200);
        const login = await request(app).post('/api/auth/login').send({ email: passwordless.email, password: 'new' });
        assert.equal(login.status, 200);
    });

    test('first sign in creates a password for a passwordless account', async () => {
        const passwordless = users.find((user) => !user.passwordHash);
        assert.ok(passwordless);
        const firstLogin = await request(app).post('/api/auth/login').send({ email: passwordless.email, password: 'first-password' });
        assert.equal(firstLogin.status, 200);
        assert.equal(firstLogin.body.passwordCreated, true);
        const nextLogin = await request(app).post('/api/auth/login').send({ email: passwordless.email, password: 'first-password' });
        assert.equal(nextLogin.status, 200);
        const wrongLogin = await request(app).post('/api/auth/login').send({ email: passwordless.email, password: 'wrong' });
        assert.equal(wrongLogin.status, 401);
    });

    test('sign in never creates an account for an unknown email', async () => {
        const response = await request(app).post('/api/auth/login').send({ email: 'unknown@example.com', password: 'AnyPassword123' });
        assert.equal(response.status, 401);
        assert.equal(users.some((user) => user.email === 'unknown@example.com'), false);
    });

    test('developer activates a plan without being charged', async () => {
        const response = await request(app).post('/api/purchases').send({ name:'Developer', email:'hrybovnikita@gmail.com', city:'Kyiv', dateOfBirth:'2000-01-01', plan:'pro' });
        assert.equal(response.status, 201);
        assert.equal(response.body.developerAccess, true);
        assert.equal(response.body.charged, false);
        const data=app.locals.db.read(); data.purchases=data.purchases.filter((item)=>item.email!=='hrybovnikita@gmail.com'); delete data.subscriptions['hrybovnikita@gmail.com']; delete data.usage['hrybovnikita@gmail.com']; app.locals.db.write(data);
    });

    test('regular purchase is rejected until a payment provider verifies it', async () => {
        const response = await request(app).post('/api/purchases').send({ name:'Customer', email:'customer@example.com', city:'Kyiv', dateOfBirth:'2000-01-01', plan:'pro' });
        assert.equal(response.status, 503);
    });

    test('GET /api/users returns every user', async () => {
        const response = await request(app).get('/api/users');
        assert.equal(response.status, 200);
        assert.equal(response.body.length, originalUsers.length);
        assert.equal(response.body[0].email, 'alice.johnson@gmail.com');
    });

    test('GET /api/users/:id returns one user', async () => {
        const response = await request(app).get('/api/users/2');
        assert.equal(response.status, 200);
        assert.equal(response.body.name, 'Jack Wilson');
    });

    test('GET /api/users/:id returns 404 for an unknown user', async () => {
        const response = await request(app).get('/api/users/999');
        assert.equal(response.status, 404);
        assert.equal(response.body.message, 'User not found');
    });

    test('POST /api/users creates a user', async () => {
        const response = await request(app).post('/api/users').send({
            name: 'Liam Martin',
            email: 'LIAM.MARTIN@gmail.com',
        });
        assert.equal(response.status, 201);
        assert.equal(response.body.id, 9);
        assert.equal(response.body.email, 'liam.martin@gmail.com');
        assert.equal(users.length, originalUsers.length + 1);
    });

    test('POST /api/users validates required fields', async () => {
        const response = await request(app).post('/api/users').send({ name: 'Missing Email' });
        assert.equal(response.status, 400);
        assert.equal(response.body.message, 'Name and email are required');
    });

    test('PUT /api/users/:id replaces a user', async () => {
        const response = await request(app).put('/api/users/3').send({
            name: 'Thomas Anderson',
            email: 'thomas@gmail.com',
        });
        assert.equal(response.status, 200);
        assert.equal(response.body.name, 'Thomas Anderson');
    });

    test('PATCH /api/users/:id updates one field', async () => {
        const response = await request(app).patch('/api/users/4').send({ name: 'Emma Williams' });
        assert.equal(response.status, 200);
        assert.equal(response.body.name, 'Emma Williams');
        assert.equal(response.body.email, 'emma.davis@gmail.com');
    });

    test('DELETE /api/users/:id removes a user', async () => {
        const response = await request(app).delete('/api/users/5');
        assert.equal(response.status, 200);
        assert.equal(response.body.user.id, 5);
        assert.equal(users.some((user) => user.id === 5), false);
    });

    test('unknown routes return 404', async () => {
        const response = await request(app).get('/api/unknown');
        assert.equal(response.status, 404);
        assert.equal(response.body.message, 'Route not found');
    });

    test('chat history can be listed, renamed and deleted', async () => {
        const data = app.locals.db.read();
        data.conversations.push({
            id: 'conversation-test',
            email: 'alice.johnson@gmail.com',
            model: 'gpt',
            title: 'Old title',
            messages: [{ role: 'user', text: 'Hello' }],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });
        app.locals.db.write(data);

        const history = await request(app).get('/api/chat/history?email=alice.johnson@gmail.com');
        assert.equal(history.status, 200);
        assert.equal(history.body[0].title, 'Old title');

        const renamed = await request(app).patch('/api/chat/history/conversation-test').send({
            email: 'alice.johnson@gmail.com',
            title: 'New title',
        });
        assert.equal(renamed.status, 200);
        assert.equal(renamed.body.title, 'New title');

        const deleted = await request(app).delete('/api/chat/history/conversation-test').send({ email: 'alice.johnson@gmail.com' });
        assert.equal(deleted.status, 200);
        assert.equal((await request(app).get('/api/chat/history?email=alice.johnson@gmail.com')).body.length, 0);
    });

    test('DELETE /api/auth/account removes the account and owned data', async () => {
        const created = await request(app).post('/api/users').send({
            name: 'Delete Me',
            email: 'delete-me@example.com',
        });
        assert.equal(created.status, 201);

        const data = app.locals.db.read();
        data.conversations.push({ id: 'owned-conversation', email: 'delete-me@example.com', model: 'gpt', title: 'Owned chat', messages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        data.subscriptions['delete-me@example.com'] = 'common';
        data.usage['delete-me@example.com'] = 2;
        data.purchases.push({ id: 1, email: 'delete-me@example.com' });
        app.locals.db.write(data);

        const response = await request(app).delete('/api/auth/account').send({ email: 'DELETE-ME@example.com' });
        assert.equal(response.status, 200);
        assert.equal(response.body.message, 'Account deleted successfully');
        assert.equal((await request(app).get('/api/users')).body.some((user) => user.email === 'delete-me@example.com'), false);
        assert.equal((await request(app).get('/api/chat/history?email=delete-me@example.com')).body.length, 0);
        const remaining = app.locals.db.read();
        assert.equal(remaining.subscriptions['delete-me@example.com'], undefined);
        assert.equal(remaining.usage['delete-me@example.com'], undefined);
        assert.equal(remaining.purchases.some((purchase) => purchase.email === 'delete-me@example.com'), false);
    });
});
