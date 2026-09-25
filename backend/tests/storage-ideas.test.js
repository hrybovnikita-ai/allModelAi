const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

process.env.NODE_ENV = 'test';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-ideas-'));
process.env.DB_FILE = path.join(directory, 'test.sqlite');
const app = require('../app');

let agent;

before(async () => {
    agent = request.agent(app);
    const result = await agent.post('/api/auth/register').send({
        name: 'Storage tester',
        email: 'storage-ideas@example.com',
        password: 'test-password',
    });
    assert.equal(result.status, 201);
});

after(() => {
    app.locals.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
});

test('storage overview exposes eight ideas', async () => {
    const response = await agent.get('/api/storage/ideas');
    assert.equal(response.status, 200);
    assert.equal(response.body.ideas.length, 8);
});

test('favorite prompts and chat settings persist per user', async () => {
    const prompt = await agent.post('/api/storage/ideas/favorite-prompts').send({
        title: 'Test',
        content: 'Explain SQLite in one paragraph.',
    });
    assert.equal(prompt.status, 201);

    const settings = await agent.post('/api/storage/ideas/chat-settings').send({
        defaultModel: 'claude',
        temperature: 0.5,
        webSearch: true,
        routerMode: 'quality',
    });
    assert.equal(settings.status, 201);
    assert.equal(settings.body.defaultModel, 'claude');

    const list = await agent.get('/api/storage/ideas/favorite-prompts');
    assert.equal(list.body.length, 1);
    assert.equal(list.body[0].content, 'Explain SQLite in one paragraph.');

    const savedSettings = await agent.get('/api/storage/ideas/chat-settings');
    assert.equal(savedSettings.body.routerMode, 'quality');
    assert.equal(savedSettings.body.webSearch, true);
});

test('bookmarks and attachments can be deleted', async () => {
    const bookmark = await agent.post('/api/storage/ideas/model-bookmarks').send({
        modelId: 'gpt-4-mini',
        label: 'Fast GPT',
    });
    assert.equal(bookmark.status, 201);

    const attachment = await agent.post('/api/storage/ideas/attachments').send({
        fileName: 'notes.txt',
        content: 'Meeting notes',
    });
    assert.equal(attachment.status, 201);

    assert.equal(
        (await agent.delete('/api/storage/ideas/model-bookmarks/gpt-4-mini')).status,
        200
    );
    assert.equal(
        (await agent.delete(`/api/storage/ideas/attachments/${attachment.body.id}`)).status,
        200
    );
});
