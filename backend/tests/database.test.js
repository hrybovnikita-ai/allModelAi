const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

process.env.NODE_ENV = 'test';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'allmodelai-db-'));
process.env.DB_FILE = path.join(directory, 'database.sqlite');
const app = require('../app');
const { connectDatabase } = require('../src/db');
after(() => {
    app.locals.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
});

test('SQL persists accounts, sessions and chats after reconnecting', async () => {
    const client = request.agent(app);
    const registered = await client.post('/api/auth/register').send({ name: 'SQL User', email: 'sql@example.com', password: 'SqlTest123!' });
    assert.equal(registered.status, 201);
    const created = await client.post('/api/chat/history').send({ model: 'gpt', messages: [{ role: 'user', text: 'Persistent SQL message' }] });
    assert.equal(created.status, 201);
    app.locals.db.close();
    app.locals.db = connectDatabase();
    assert.equal((await client.get('/api/auth/session')).body.user.email, 'sql@example.com');
    const saved = app.locals.db.database.prepare('SELECT messages FROM conversations WHERE id = ?').get(created.body.id);
    assert.match(saved.messages, /Persistent SQL message/);
    const history = await client.get('/api/chat/history');
    assert.equal(history.status, 200);
    assert.ok(JSON.stringify(history.body).includes(created.body.id));
    assert.equal((await request(app).get('/api/chat/history')).status, 401);
    const health = await client.get('/api/health');
    assert.deepEqual(health.body.database, { engine: 'sqlite', connected: true });
    assert.equal(app.locals.db.database.pragma('integrity_check', { simple: true }), 'ok');
});
