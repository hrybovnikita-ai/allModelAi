const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const { ensureAiEngineeringSchema } = require('../src/aiEngineeringSchema');
const knowledgeBaseService = require('../src/services/rag/knowledgeBaseService');

let db;
let dbPath;

before(() => {
    dbPath = path.join(__dirname, 'tmp-kb-test.sqlite');
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    db = new Database(dbPath);
    ensureAiEngineeringSchema(db);
});

after(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
});

test('knowledge base indexes and retrieves per user', async () => {
    const connection = { database: db };
    await knowledgeBaseService.indexDocument(connection, 'alice@test.com', {
        name: 'ml-notes.txt',
        mimeType: 'text/plain',
        content: 'Gradient descent updates parameters using the gradient of the loss. Adam adapts learning rates.',
    });
    await knowledgeBaseService.indexDocument(connection, 'bob@test.com', {
        name: 'other.txt',
        mimeType: 'text/plain',
        content: 'Unrelated finance notes only.',
    });

    const hits = await knowledgeBaseService.retrieveForQuery(connection, 'alice@test.com', 'Adam optimizer', 3);
    assert.ok(hits.length >= 1);
    assert.match(hits[0].excerpt, /Adam|Gradient/i);

    const isolated = await knowledgeBaseService.retrieveForQuery(connection, 'bob@test.com', 'Adam optimizer', 3);
    assert.equal(isolated.length, 0);
});
