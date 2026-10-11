const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { ensureAiEngineeringSchema } = require('../src/aiEngineeringSchema');
const { ensureIntelligenceSchema } = require('../src/intelligence/intelligenceSchema');
const knowledgeBaseService = require('../src/services/rag/knowledgeBaseService');
const { aggregateRetrievalMetrics } = require('../src/intelligence/retrievalMetrics');
const {
    createCollection,
    runRetrievalEval,
} = require('../src/intelligence/knowledgeLearningService');
const { runDeterministicBenchmark } = require('../src/intelligence/selfEvaluationService');
const { computeModelScore } = require('../src/intelligence/routerLearningService');

function connectionFromDb(db) {
    return { database: db };
}

test('retrieval metrics require labeled expected chunk IDs', () => {
    const empty = aggregateRetrievalMetrics([{ query: 'x', expectedChunkIds: [], retrievedChunkIds: ['a'] }]);
    assert.equal(empty.sampleSize, 0);
    const metrics = aggregateRetrievalMetrics([
        {
            query: 'adam',
            expectedChunkIds: ['kb-1:0', 'kb-1:1'],
            retrievedChunkIds: ['kb-1:0', 'kb-9:0'],
        },
    ], 2);
    assert.equal(metrics.sampleSize, 1);
    assert.equal(metrics.recallAtK, 0.5);
    assert.equal(metrics.precisionAtK, 0.5);
    assert.equal(metrics.mrr, 1);
});

test('knowledge indexing stores checksum and supports labeled retrieval eval', async () => {
    const db = new Database(':memory:');
    ensureAiEngineeringSchema(db);
    ensureIntelligenceSchema(db);
    const connection = connectionFromDb(db);

    const indexed = await knowledgeBaseService.indexDocument(connection, 'alice@test.com', {
        name: 'Paper',
        content: 'The Adam optimizer adapts learning rates for neural networks.',
    });
    assert.ok(indexed.contentChecksum);
    assert.equal(indexed.chunkCount > 0, true);

    const chunkId = `${indexed.id}:0`;
    const evalResult = await runRetrievalEval(connection, 'alice@test.com', {
        datasetVersion: 'test-v1',
        queries: [{ query: 'Adam optimizer', expectedChunkIds: [chunkId] }],
    });
    assert.equal(evalResult.stored, 1);
    assert.equal(evalResult.metrics.sampleSize, 1);
    assert.ok(evalResult.metrics.recallAtK >= 0);
});

test('deterministic benchmark run persists results without LLM calls', async () => {
    const db = new Database(':memory:');
    ensureAiEngineeringSchema(db);
    ensureIntelligenceSchema(db);
    const connection = connectionFromDb(db);
    const outcome = await runDeterministicBenchmark(connection, 'dev@test.com', { suiteId: 'mathematics' });
    assert.ok(outcome.runId);
    assert.equal(outcome.summary.total, 2);
    assert.equal(outcome.summary.measuredOnly, true);
    assert.equal(outcome.results.every((r) => r.outcome === 'pass'), true);
});

test('router score returns null when sample size is too small', () => {
    const score = computeModelScore(
        { successRate: 1, avgLatencyMs: 1000, sampleSize: 3 },
        { minLatency: 500, maxLatency: 5000 },
        { quality: 0.4, reliability: 0.3, speed: 0.2, cost: 0.1 },
    );
    assert.equal(score.score, null);
    assert.equal(score.uncertainty, 'high');
});

test('knowledge collections CRUD', async () => {
    const db = new Database(':memory:');
    ensureIntelligenceSchema(db);
    const connection = connectionFromDb(db);
    const created = await createCollection(connection, 'alice@test.com', { name: 'Research' });
    assert.ok(created.id);
});
