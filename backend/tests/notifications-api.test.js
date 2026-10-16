'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const crypto = require('node:crypto');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(
    os.tmpdir(),
    `allmodelai-notifications-${process.pid}-${Date.now()}.sqlite`,
);

const app = require('../app');

after(() => {
    try {
        app.locals.db?.close?.();
    } catch {
        /* ignore */
    }
});

test('notifications require authentication', async () => {
    const res = await request(app).get('/api/notifications');
    assert.ok([401, 403].includes(res.status));
});

test('notifications list and mark-read for authenticated user', async () => {
    const email = `notify-${crypto.randomUUID()}@example.com`;
    const password = 'TestPass123!';
    const api = request.agent(app);
    const registered = await api.post('/api/auth/register').send({
        name: 'Notify User',
        email,
        password,
    });
    assert.ok([200, 201].includes(registered.status), `register failed: ${registered.status}`);

    const id = `notification-${crypto.randomUUID()}`;
    const createdAt = new Date().toISOString();
    const db = app.locals.db;
    assert.ok(db?.database?.prepare, 'SQLite test database expected');
    db.database.prepare(
        'INSERT INTO notifications (id,email,title,message,kind,created_at) VALUES (?,?,?,?,?,?)',
    ).run(id, email, 'Provider recovered', 'Gemini is available again.', 'provider', createdAt);

    const list = await api.get('/api/notifications');
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(list.body));
    const row = list.body.find((item) => item.id === id);
    assert.ok(row, 'notification should be listed for owner');
    assert.equal(row.readAt ?? row.read_at ?? null, null);

    const mark = await api.patch(`/api/notifications/${id}/read`);
    assert.equal(mark.status, 200);

    const list2 = await api.get('/api/notifications');
    const row2 = list2.body.find((item) => item.id === id);
    assert.ok(row2?.readAt || row2?.read_at, 'notification should be marked read');

    const other = request.agent(app);
    await other.post('/api/auth/register').send({
        name: 'Other User',
        email: `other-${crypto.randomUUID()}@example.com`,
        password,
    });
    const leaked = await other.get('/api/notifications');
    assert.equal(leaked.status, 200);
    assert.ok(!leaked.body.some((item) => item.id === id), 'notifications must not leak across users');
});
