const { test } = require('node:test');
const assert = require('node:assert/strict');

const { classifyTask, isSimpleGreeting } = require('../src/services/smartRouter2/classifyTask');
const { selectSmartRoute } = require('../src/services/smartRouter2');
const { splitTextIntoChunks } = require('../src/services/rag/chunking');
const { embedLocal, cosineSimilarity } = require('../src/services/rag/embeddingProvider');

test('classifyTask detects greetings without multi-agent', () => {
    assert.equal(isSimpleGreeting('Hello!'), true);
    const task = classifyTask('Hello!');
    assert.equal(task.taskType, 'greeting');
    assert.equal(task.needsMultiAgent, false);
});

test('classifyTask detects coding tasks', () => {
    const task = classifyTask('Fix this React component and add tests');
    assert.equal(task.taskType, 'coding');
});

test('selectSmartRoute returns structured decision', () => {
    const route = selectSmartRoute('Implement binary search in Python', {
        routerMode: 'balanced',
        modelAllowed: () => true,
    });
    assert.ok(route.model);
    assert.ok(route.reason);
    assert.ok(route.taskType);
    assert.ok(Array.isArray(route.fallbackSlugs));
});

test('RAG chunking splits overlapping text', () => {
    const text = 'a'.repeat(2500);
    const chunks = splitTextIntoChunks(text, 900, 100);
    assert.ok(chunks.length >= 2);
    assert.ok(chunks[0].text.length <= 900);
});

test('local embeddings rank similar text higher', () => {
    const a = embedLocal('gradient descent optimizer learning rate');
    const b = embedLocal('gradient descent updates weights using the gradient');
    const c = embedLocal('completely unrelated cooking recipe pasta');
    assert.ok(cosineSimilarity(a, b) > cosineSimilarity(a, c));
});
