const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
    MEMORY_COLLECTION,
    MEMORY_EMBEDDING_DIM,
    MEMORY_EMBEDDING_MODEL,
    assertEmbeddingCompatible,
    getSchemaReport,
} = require('../src/services/zilliz/zillizMemorySchema');
const {
    embedMemoryText,
    userFilter,
    upsertMemoryVector,
    deleteMemoryVector,
    searchMemoryVectors,
    listMemoryVectorsForUser,
    ensureMemoryCollection,
} = require('../src/services/zilliz/zillizMemoryStore');
const { EMBEDDING_DIM } = require('../src/services/rag/embeddingProvider');

function createMockClient({ collections = new Set() } = {}) {
    const rows = [];
    return {
        rows,
        async hasCollection({ collection_name }) {
            return { value: collections.has(collection_name) };
        },
        async createCollection({ collection_name, fields }) {
            collections.add(collection_name);
            this.lastFields = fields;
            return { status: { error_code: 'Success' } };
        },
        async createIndex() {
            return { status: { error_code: 'Success' } };
        },
        async loadCollection() {
            return { status: { error_code: 'Success' } };
        },
        async describeCollection() {
            return { status: { error_code: 'Success' } };
        },
        async upsert({ data }) {
            for (const row of data) {
                const idx = rows.findIndex((r) => r.id === row.id);
                if (idx >= 0) rows[idx] = row;
                else rows.push(row);
            }
            return { status: { error_code: 'Success' } };
        },
        async insert({ data }) {
            rows.push(...data);
            return { status: { error_code: 'Success' } };
        },
        async delete({ filter }) {
            const idMatch = filter.match(/id == "([^"]+)"/);
            const userMatch = filter.match(/user_id == "([^"]+)"/);
            const userId = userMatch?.[1];
            const id = idMatch?.[1];
            for (let i = rows.length - 1; i >= 0; i -= 1) {
                const row = rows[i];
                if (userId && row.user_id !== userId) continue;
                if (id && row.id !== id) continue;
                if (userId || id) rows.splice(i, 1);
            }
            return { status: { error_code: 'Success' } };
        },
        async search({ filter, limit }) {
            const userMatch = filter.match(/user_id == "([^"]+)"/);
            const userId = userMatch?.[1];
            const results = rows
                .filter((row) => row.user_id === userId)
                .slice(0, limit)
                .map((entity) => ({ entity, score: 0.9 }));
            return { results };
        },
        async query({ filter, limit }) {
            const userMatch = filter.match(/user_id == "([^"]+)"/);
            const userId = userMatch?.[1];
            return {
                data: rows.filter((row) => row.user_id === userId).slice(0, limit),
            };
        },
    };
}

beforeEach(() => {
    // no shared state
});

test('schema dimension matches local-hash embedding provider', () => {
    assert.equal(MEMORY_EMBEDDING_DIM, EMBEDDING_DIM);
    assert.equal(MEMORY_EMBEDDING_DIM, 256);
    assert.equal(MEMORY_EMBEDDING_MODEL, 'local-hash-v1');
    assert.equal(MEMORY_COLLECTION, 'allmodelai_user_memory');
    const embedded = embedMemoryText('I prefer concise answers');
    assert.equal(embedded.vector.length, MEMORY_EMBEDDING_DIM);
    assert.doesNotThrow(() => assertEmbeddingCompatible(embedded));
    assert.throws(
        () => assertEmbeddingCompatible({ model: 'local-hash-v1', vector: [1, 2, 3] }),
        (err) => err.code === 'MEMORY_EMBEDDING_DIM_MISMATCH',
    );
    const report = getSchemaReport();
    assert.equal(report.chatInjectionEnabled, false);
});

test('user filter always scopes by authenticated user id', () => {
    assert.equal(userFilter('a@example.com'), 'user_id == "a@example.com"');
    assert.match(userFilter('evil" or true'), /user_id == "evil\\" or true"/);
});

test('upsert/search/delete enforce user isolation', async () => {
    const client = createMockClient();
    await ensureMemoryCollection({ client });
    assert.equal(client.lastFields.some((f) => f.name === 'embedding' && f.dim === 256), true);

    await upsertMemoryVector({
        client,
        userId: 'alice@example.com',
        memoryId: 'mem-a1',
        content: 'Alice likes TypeScript',
        contentPreview: 'Alice likes TypeScript',
    });
    await upsertMemoryVector({
        client,
        userId: 'bob@example.com',
        memoryId: 'mem-b1',
        content: 'Bob likes baking bread',
        contentPreview: 'Bob likes baking bread',
    });

    const aliceHits = await searchMemoryVectors({
        client,
        userId: 'alice@example.com',
        query: 'TypeScript',
        limit: 10,
    });
    assert.equal(aliceHits.length, 1);
    assert.equal(aliceHits[0].id, 'mem-a1');
    assert.ok(!aliceHits.some((item) => /Bob|baking/i.test(item.contentPreview)));

    const bobList = await listMemoryVectorsForUser({ client, userId: 'bob@example.com' });
    assert.equal(bobList.length, 1);
    assert.equal(bobList[0].id, 'mem-b1');

    await deleteMemoryVector({ client, userId: 'alice@example.com', memoryId: 'mem-a1' });
    const aliceAfter = await listMemoryVectorsForUser({ client, userId: 'alice@example.com' });
    assert.equal(aliceAfter.length, 0);
    const bobAfter = await listMemoryVectorsForUser({ client, userId: 'bob@example.com' });
    assert.equal(bobAfter.length, 1);
});

test('refuses to index sensitive secrets', async () => {
    const { syntheticOpenAiSk } = require('./syntheticSecrets');
    const client = createMockClient({ collections: new Set([MEMORY_COLLECTION]) });
    await assert.rejects(
        () => upsertMemoryVector({
            client,
            userId: 'alice@example.com',
            memoryId: 'mem-secret',
            content: `api_key: ${syntheticOpenAiSk('abcdefghijklmnopqrstuvwxyz0123456789')}`,
        }),
        (err) => err.code === 'MEMORY_SENSITIVE_CONTENT',
    );
});
