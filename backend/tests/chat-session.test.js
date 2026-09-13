const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

process.env.NODE_ENV = 'test';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'allmodelai-session-recovery-'));
process.env.DB_FILE = path.join(directory, 'database.sqlite');
process.env.API_KEY = 'test-key';
const app = require('../app');
after(() => {
  app.locals.db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('an expired session can sign in again and retry the saved conversation', async () => {
  const client = request.agent(app);
  const account = { name: 'Recovery User', email: 'recovery@example.com', password: 'RecoveryTest123!' };
  assert.equal((await client.post('/api/auth/register').send(account)).status, 201);
  const messages = [{ role: 'user', text: 'Hello again' }];
  const saved = await client.post('/api/chat/history').send({ model: 'gpt', messages });
  assert.equal(saved.status, 201);
  app.locals.db.database.prepare('UPDATE auth_sessions SET expires_at = ?').run(0);
  const payload = { model: 'gpt', conversationId: saved.body.id, messages };
  assert.equal((await client.post('/api/chat').send(payload)).status, 401);
  assert.equal((await client.post('/api/auth/login').send(account)).status, 200);
  const originalFetch = global.fetch;
  global.fetch = async () => new Response('data: {"choices":[{"delta":{"content":"Recovered answer"}}]}\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
  try {
    const answer = await client.post('/api/chat').send(payload);
    assert.equal(answer.status, 200);
    assert.match(answer.text, /Recovered answer/);
    assert.equal((await client.get('/api/auth/session')).status, 200);
  } finally {
    global.fetch = originalFetch;
  }
});

test('chat response errors preserve the status and successful streams remain readable', async () => {
  const { checkChatResponse } = await import('../../frontend/src/lib/api.js');
  await assert.rejects(checkChatResponse(new Response('{}', { status: 401 })), (error) => {
    assert.equal(error.status, 401);
    assert.match(error.message, /conversation is still open/);
    return true;
  });
  await assert.rejects(checkChatResponse(new Response(JSON.stringify({ message: 'Provider unavailable' }), { status: 502 })), (error) => {
    assert.equal(error.status, 502);
    assert.equal(error.message, 'Provider unavailable');
    return true;
  });
  const stream = new Response('data: answer\n\n');
  assert.equal(await checkChatResponse(stream), stream);
  assert.equal(await stream.text(), 'data: answer\n\n');
});
