const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-files-${process.pid}-${Date.now()}.sqlite`);
process.env.API_KEY = 'test-key';
process.env.DEVELOPER_EMAILS = 'file-owner@example.com';
const app = require('../app');
after(() => app.locals.db.close());

test('file mode reaches the model and produces a durable private file', async () => {
  const owner = request.agent(app);
  const other = request.agent(app);
  await owner.post('/api/auth/register').send({ name: 'Owner', email: 'file-owner@example.com', password: 'test' });
  await other.post('/api/auth/register').send({ name: 'Other', email: 'file-other@example.com', password: 'test' });
  const artifact = JSON.stringify({ type: 'allmodelai-file', name: 'hello.py', title: 'Greeting script', content: 'print("Hello")\n' });
  const messages = [{ role: 'user', text: 'Create a Python greeting script' }];
  const created = await owner.post('/api/chat/history').send({ model: 'qwen', messages });
  assert.equal(created.status, 201);
  const oldFetch = global.fetch;
  let prompt;
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    prompt = body.messages[0].content;
    return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: artifact } }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
  };
  try {
    const response = await owner.post('/api/chat').send({ model: 'qwen', responseMode: 'file', conversationId: created.body.id, messages });
    assert.equal(response.status, 200);
    assert.match(prompt, /allmodelai-file/);
    assert.match(prompt, /without Markdown fences/);
    assert.doesNotMatch(prompt, /Start the answer immediately with the complete runnable code in a fenced/);
    assert.match(response.text, /hello.py/);
    await new Promise(resolve => setImmediate(resolve));
    const { parseGeneratedFile, findGeneratedFile } = await import('../../frontend/src/lib/generatedFiles.js');
    const id = parseGeneratedFile(artifact).id;
    const history = await owner.get('/api/chat/history');
    const conversation = history.body.find(item => item.id === created.body.id);
    assert.equal(findGeneratedFile(conversation, id).content, 'print("Hello")\n');
    assert.equal((await other.get('/api/chat/history')).body.some(item => item.id === conversation.id), false);
    assert.equal((await request(app).get('/api/chat/history')).status, 401);
    app.locals.db.close();
    app.locals.db = require('../src/db').connectDatabase();
    const reloaded = await owner.get('/api/chat/history');
    assert.equal(findGeneratedFile(reloaded.body.find(item => item.id === conversation.id), id).name, 'hello.py');
  } finally { global.fetch = oldFetch; }
});
