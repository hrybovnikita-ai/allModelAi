const { test } = require('node:test');
const assert = require('node:assert/strict');
const knowledgeBaseService = require('../src/services/rag/knowledgeBaseService');

test('retrieveForQuery uses pgAsyncPool when connection.pool is absent', async () => {
    let knowledgeQuery = false;
    const connection = {
        engine: 'postgres',
        pgAsyncPool: {
            query: async (configOrText) => {
                const text = typeof configOrText === 'object' && configOrText !== null
                    ? configOrText.text
                    : configOrText;
                if (/knowledge_chunks/i.test(String(text))) {
                    knowledgeQuery = true;
                    return { rows: [], rowCount: 0 };
                }
                return { rows: [], rowCount: 0 };
            },
        },
    };

    const hits = await knowledgeBaseService.retrieveForQuery(connection, 'user@example.com', 'snake game');
    assert.equal(knowledgeQuery, true);
    assert.deepEqual(hits, []);
});
