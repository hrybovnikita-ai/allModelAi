const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-community-${process.pid}-${Date.now()}.sqlite`);
const app = require('../app');
const users = require('../src/data/data');

test('public users API lists registered accounts from the database', async () => {
  const userA = { name: 'Community A', email: 'community-a@example.com', password: 'CommunityA1' };
  const userB = { name: 'Community B', email: 'community-b@example.com', password: 'CommunityB2' };

  assert.equal((await request(app).post('/api/auth/register').send(userA)).status, 201);
  assert.equal((await request(app).post('/api/auth/register').send(userB)).status, 201);

  for (const path of ['/api/users', '/api/community/users']) {
    const response = await request(app).get(path);
    assert.equal(response.status, 200, path);
    assert.ok(Array.isArray(response.body.users), path);
    assert.equal(response.body.users.length, 2, path);
    assert.deepEqual(Object.keys(response.body.users[0]).sort(), ['id', 'name']);
    assert.ok(response.body.users.some((row) => row.name === userA.name));
    assert.ok(response.body.users.some((row) => row.name === userB.name));
    assert.equal(
      response.body.users.some((row) => Object.prototype.hasOwnProperty.call(row, 'email')),
      false,
    );
    assert.equal(
      response.body.users.some((row) => Object.prototype.hasOwnProperty.call(row, 'passwordHash')),
      false,
    );
  }

  const db = app.locals.db.database;
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 2);

  for (const email of [userA.email, userB.email]) {
    db.prepare('DELETE FROM users WHERE lower(email) = ?').run(email);
    const index = users.findIndex((item) => item.email === email);
    if (index !== -1) users.splice(index, 1);
  }
});
