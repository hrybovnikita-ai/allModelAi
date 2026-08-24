const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

process.env.DB_FILE = path.join(os.tmpdir(), 'allmodelai-users-test.json');
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
