const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
process.env.NODE_ENV = 'test';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'everyday-workspace-'));
process.env.DB_FILE = path.join(directory, 'test.sqlite');
const app = require('../app');
let owner, other;
before(async () => {
  owner = request.agent(app); other = request.agent(app);
  for (const [agent, email] of [[owner, 'everyday-owner@example.com'], [other, 'everyday-other@example.com']]) {
    const result = await agent.post('/api/auth/register').send({ name: 'Everyday tester', email, password: 'test-password' });
    assert.equal(result.status, 201);
  }
});
after(() => { app.locals.db.close(); fs.rmSync(directory, { recursive: true, force: true }); });
test('new saved answers and writing drafts persist and remain private', async () => {
  for (const type of ['saved_answer', 'writing']) {
    const response = await owner.post('/api/workspace').send({ type, name: 'Draft', content: 'Private answer', collection: 'Work', email: 'everyday-other@example.com' });
    assert.equal(response.status, 201);
    const id = response.body.id;
    assert.equal((await request(app).get('/api/workspace?type=' + type)).status, 401);
    assert.deepEqual((await other.get('/api/workspace?type=' + type)).body, []);
    assert.equal((await other.patch('/api/workspace/' + id).send({ content: 'stolen' })).status, 404);
    assert.equal((await other.delete('/api/workspace/' + id)).status, 404);
    assert.equal((await owner.patch('/api/workspace/' + id).send({ collection: 'Research' })).status, 200);
    const saved = (await owner.get('/api/workspace?type=' + type)).body[0];
    assert.equal(saved.content, 'Private answer'); assert.equal(saved.collection, 'Research');
    assert.equal((await owner.delete('/api/workspace/' + id)).status, 200);
    assert.deepEqual((await owner.get('/api/workspace?type=' + type)).body, []);
  }
});
test('projects preserve linked document references and conversations; workflows preserve step order', async () => {
  const document = await owner.post('/api/workspace').send({ type: 'document', name: 'Notes', pages: [{ page: 1, text: 'Source' }] });
  const project = { type: 'project', name: 'Research', instructions: 'Be concise', documentIds: [document.body.id], messages: [{ role: 'user', content: 'Question' }, { role: 'assistant', content: 'Answer' }] };
  assert.equal((await owner.post('/api/workspace').send(project)).status, 201);
  const saved = (await owner.get('/api/workspace?type=project')).body[0];
  assert.deepEqual(saved.messages, project.messages); assert.deepEqual(saved.documentIds, project.documentIds);
  const workflow = { type: 'workflow', name: 'Summary', tool: 'everyday-ai', steps: ['Summarize', 'Translate'], input: 'Notes' };
  assert.equal((await owner.post('/api/workspace').send(workflow)).status, 201);
  assert.deepEqual((await owner.get('/api/workspace?type=workflow')).body[0].steps, workflow.steps);
});
