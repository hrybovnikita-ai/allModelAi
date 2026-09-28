const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-reg-${process.pid}-${Date.now()}.sqlite`);
const app = require('../app');

after(() => {
  try { fs.rmSync(process.env.DB_FILE, { force: true }); } catch { /* ignore */ }
});

test('registration creates session and returns user without password hash', async () => {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    name: 'New User',
    email: 'new-user@example.com',
    password: 'secure-password',
    rememberMe: true,
  });
  assert.equal(response.status, 201);
  assert.equal(response.body.user.email, 'new-user@example.com');
  assert.equal(response.body.user.passwordHash, undefined);
  assert.match(response.headers['set-cookie']?.[0] || '', /allmodelai_session=/);
  assert.equal((await agent.get('/api/auth/session')).body.user.email, 'new-user@example.com');
});

test('registration validation messages are explicit', async () => {
  assert.equal((await request(app).post('/api/auth/register').send({ name: '', email: 'bad', password: 'short' })).body.message, 'Please enter your name.');
  assert.equal((await request(app).post('/api/auth/register').send({ name: 'Al', email: 'not-an-email', password: 'long-enough' })).body.message, 'Please enter a valid email address.');
  assert.equal((await request(app).post('/api/auth/register').send({ name: 'Al', email: 'a@b.com', password: 'abc' })).body.message, 'Password must contain at least 8 characters.');
});

test('duplicate registration returns clear conflict message', async () => {
  await request(app).post('/api/auth/register').send({
    name: 'First',
    email: 'duplicate@example.com',
    password: 'first-password',
  });
  const duplicate = await request(app).post('/api/auth/register').send({
    name: 'Second',
    email: 'duplicate@example.com',
    password: 'second-password',
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.code, 'EMAIL_ALREADY_EXISTS');
  assert.match(duplicate.body.message, /Sign in instead/i);
});
