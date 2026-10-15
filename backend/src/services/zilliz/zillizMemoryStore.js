/**
 * Zilliz-backed vector store for AI user memories.
 * Isolation: every query/mutation is scoped by authenticated user_id.
 */

const { getZillizClient } = require('./zillizClient');
const { getZillizConfig } = require('./zillizConfig');
const {
    MEMORY_COLLECTION,
    MEMORY_EMBEDDING_MODEL,
    MEMORY_EMBEDDING_DIM,
    FIELD,
    assertEmbeddingCompatible,
    buildCollectionFields,
    getSchemaReport,
} = require('./zillizMemorySchema');
const { embedLocal } = require('../rag/embeddingProvider');
const { containsSensitiveContent } = require('../memoryRetrieval');

function normalizeUserId(email) {
    return String(email || '').trim().toLowerCase();
}

function escapeFilterValue(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function userFilter(userId) {
    return `${FIELD.userId} == "${escapeFilterValue(userId)}"`;
}

function toUnixMs(isoOrMs) {
    if (typeof isoOrMs === 'number' && Number.isFinite(isoOrMs)) return Math.trunc(isoOrMs);
    const ms = Date.parse(String(isoOrMs || ''));
    return Number.isFinite(ms) ? ms : Date.now();
}

function embedMemoryText(text) {
    const vector = embedLocal(text);
    const record = {
        provider: 'local-hash',
        model: MEMORY_EMBEDDING_MODEL,
        vector,
    };
    assertEmbeddingCompatible(record);
    return record;
}

function statusOk(result) {
    const code = result?.status?.error_code ?? result?.error_code ?? result?.code;
    if (code == null) return true;
    return code === 0 || code === 'Success' || String(code) === 'Success';
}

async function ensureMemoryCollection({ client: injectedClient = null } = {}) {
    const client = injectedClient || await getZillizClient();
    const { DataType, MetricType, IndexType } = require('@zilliz/milvus2-sdk-node');
    const collection = MEMORY_COLLECTION;

    const has = await client.hasCollection({ collection_name: collection });
    const exists = Boolean(has?.value ?? has);
    let created = false;

    if (!exists) {
        const createResult = await client.createCollection({
            collection_name: collection,
            fields: buildCollectionFields(DataType),
            enable_dynamic_field: false,
        });
        if (!statusOk(createResult)) {
            const err = new Error(createResult?.status?.reason || 'Failed to create Zilliz memory collection');
            err.code = 'ZILLIZ_CREATE_COLLECTION_FAILED';
            throw err;
        }
        created = true;

        const indexResult = await client.createIndex({
            collection_name: collection,
            field_name: FIELD.embedding,
            index_name: 'embedding_cosine_idx',
            index_type: IndexType.AUTOINDEX || 'AUTOINDEX',
            metric_type: MetricType.COSINE,
        });
        if (!statusOk(indexResult)) {
            const err = new Error(indexResult?.status?.reason || 'Failed to create embedding index');
            err.code = 'ZILLIZ_CREATE_INDEX_FAILED';
            throw err;
        }
    }

    const loadResult = await client.loadCollection({ collection_name: collection });
    if (!statusOk(loadResult) && !/already loaded|loaded/i.test(String(loadResult?.status?.reason || ''))) {
        // Soft-warn: some serverless responses still allow search after load races.
        console.warn('[ZILLIZ_MEMORY] loadCollection:', loadResult?.status?.reason || 'unexpected load status');
    }

    const described = typeof client.describeCollection === 'function'
        ? await client.describeCollection({ collection_name: collection })
        : null;

    return {
        collection,
        created,
        exists: true,
        schema: getSchemaReport(),
        describeOk: Boolean(described),
    };
}

async function upsertMemoryVector({
    userId,
    memoryId,
    content,
    contentPreview = '',
    sourceType = 'user',
    createdAt = null,
    updatedAt = null,
    client: injectedClient = null,
}) {
    const uid = normalizeUserId(userId);
    const id = String(memoryId || '').trim();
    if (!uid || !id) {
        const err = new Error('userId and memoryId are required');
        err.status = 400;
        err.code = 'MEMORY_VECTOR_INVALID';
        throw err;
    }
    if (containsSensitiveContent(content) || containsSensitiveContent(contentPreview)) {
        const err = new Error('Refusing to index sensitive memory content');
        err.status = 400;
        err.code = 'MEMORY_SENSITIVE_CONTENT';
        throw err;
    }

    const textForEmbed = String(content || contentPreview || '').trim();
    if (!textForEmbed) {
        const err = new Error('Memory text is required for embedding');
        err.status = 400;
        throw err;
    }

    const embedding = embedMemoryText(textForEmbed);
    const preview = String(contentPreview || textForEmbed).slice(0, 480);
    const client = injectedClient || await getZillizClient();
    await ensureMemoryCollection({ client });

    const now = Date.now();
    const row = {
        [FIELD.id]: id,
        [FIELD.userId]: uid,
        [FIELD.contentPreview]: preview,
        [FIELD.sourceType]: String(sourceType || 'user').slice(0, 64),
        [FIELD.embeddingModel]: MEMORY_EMBEDDING_MODEL,
        [FIELD.createdAt]: toUnixMs(createdAt) || now,
        [FIELD.updatedAt]: toUnixMs(updatedAt) || now,
        [FIELD.embedding]: embedding.vector,
    };

    // Prefer upsert when available; fall back to delete+insert.
    if (typeof client.upsert === 'function') {
        const result = await client.upsert({
            collection_name: MEMORY_COLLECTION,
            data: [row],
        });
        if (!statusOk(result)) {
            const err = new Error(result?.status?.reason || 'Zilliz upsert failed');
            err.code = 'ZILLIZ_UPSERT_FAILED';
            throw err;
        }
    } else {
        await client.delete({
            collection_name: MEMORY_COLLECTION,
            filter: `${FIELD.id} == "${escapeFilterValue(id)}" && ${userFilter(uid)}`,
        }).catch(() => {});
        const result = await client.insert({
            collection_name: MEMORY_COLLECTION,
            data: [row],
        });
        if (!statusOk(result)) {
            const err = new Error(result?.status?.reason || 'Zilliz insert failed');
            err.code = 'ZILLIZ_INSERT_FAILED';
            throw err;
        }
    }

    if (typeof client.flushSync === 'function') {
        await client.flushSync({ collection_names: [MEMORY_COLLECTION] }).catch(() => {});
    }

    return {
        id,
        userId: uid,
        embeddingModel: MEMORY_EMBEDDING_MODEL,
        embeddingDim: MEMORY_EMBEDDING_DIM,
    };
}

async function deleteMemoryVector({ userId, memoryId, client: injectedClient = null }) {
    const uid = normalizeUserId(userId);
    const id = String(memoryId || '').trim();
    if (!uid || !id) return { deleted: false };
    const client = injectedClient || await getZillizClient();
    const has = await client.hasCollection({ collection_name: MEMORY_COLLECTION });
    if (!Boolean(has?.value ?? has)) return { deleted: false, missingCollection: true };

    const result = await client.delete({
        collection_name: MEMORY_COLLECTION,
        filter: `${FIELD.id} == "${escapeFilterValue(id)}" && ${userFilter(uid)}`,
    });
    return { deleted: statusOk(result), statusOk: statusOk(result) };
}

async function deleteAllMemoryVectorsForUser({ userId, client: injectedClient = null }) {
    const uid = normalizeUserId(userId);
    if (!uid) return { deleted: false };
    const client = injectedClient || await getZillizClient();
    const has = await client.hasCollection({ collection_name: MEMORY_COLLECTION });
    if (!Boolean(has?.value ?? has)) return { deleted: false, missingCollection: true };

    const result = await client.delete({
        collection_name: MEMORY_COLLECTION,
        filter: userFilter(uid),
    });
    return { deleted: statusOk(result) };
}

/**
 * Vector search scoped to one user. Never returns another user's rows.
 */
async function searchMemoryVectors({
    userId,
    query,
    limit = 8,
    client: injectedClient = null,
}) {
    const uid = normalizeUserId(userId);
    const text = String(query || '').trim();
    if (!uid || !text) return [];

    const client = injectedClient || await getZillizClient();
    const has = await client.hasCollection({ collection_name: MEMORY_COLLECTION });
    if (!Boolean(has?.value ?? has)) return [];

    const embedding = embedMemoryText(text);
    const { MetricType } = require('@zilliz/milvus2-sdk-node');
    const result = await client.search({
        collection_name: MEMORY_COLLECTION,
        data: [embedding.vector],
        anns_field: FIELD.embedding,
        limit: Math.min(Math.max(Number(limit) || 8, 1), 50),
        metric_type: MetricType.COSINE,
        filter: userFilter(uid),
        output_fields: [
            FIELD.id,
            FIELD.userId,
            FIELD.contentPreview,
            FIELD.sourceType,
            FIELD.embeddingModel,
            FIELD.createdAt,
            FIELD.updatedAt,
        ],
    });

    const rows = Array.isArray(result?.results)
        ? result.results
        : (Array.isArray(result?.data) ? result.data : []);

    return rows
        .map((row) => {
            const entity = row.entity || row;
            const owner = String(entity[FIELD.userId] || entity.user_id || '').toLowerCase();
            // Defense-in-depth: drop any row that somehow escaped the filter.
            if (owner !== uid) return null;
            return {
                id: entity[FIELD.id] || entity.id,
                userId: owner,
                contentPreview: entity[FIELD.contentPreview] || entity.content_preview || '',
                sourceType: entity[FIELD.sourceType] || entity.source_type || 'user',
                embeddingModel: entity[FIELD.embeddingModel] || entity.embedding_model || MEMORY_EMBEDDING_MODEL,
                createdAt: entity[FIELD.createdAt] || entity.created_at || null,
                updatedAt: entity[FIELD.updatedAt] || entity.updated_at || null,
                score: row.score ?? row.distance ?? null,
            };
        })
        .filter(Boolean);
}

async function listMemoryVectorsForUser({
    userId,
    limit = 100,
    client: injectedClient = null,
}) {
    const uid = normalizeUserId(userId);
    if (!uid) return [];
    const client = injectedClient || await getZillizClient();
    const has = await client.hasCollection({ collection_name: MEMORY_COLLECTION });
    if (!Boolean(has?.value ?? has)) return [];

    const result = await client.query({
        collection_name: MEMORY_COLLECTION,
        filter: userFilter(uid),
        output_fields: [
            FIELD.id,
            FIELD.userId,
            FIELD.contentPreview,
            FIELD.sourceType,
            FIELD.createdAt,
            FIELD.updatedAt,
        ],
        limit: Math.min(Math.max(Number(limit) || 100, 1), 200),
    });

    const rows = Array.isArray(result?.data) ? result.data : (Array.isArray(result) ? result : []);
    return rows
        .map((entity) => {
            const owner = String(entity[FIELD.userId] || entity.user_id || '').toLowerCase();
            if (owner !== uid) return null;
            return {
                id: entity[FIELD.id] || entity.id,
                userId: owner,
                contentPreview: entity[FIELD.contentPreview] || '',
                sourceType: entity[FIELD.sourceType] || 'user',
                createdAt: entity[FIELD.createdAt] || null,
                updatedAt: entity[FIELD.updatedAt] || null,
            };
        })
        .filter(Boolean);
}

function isZillizMemoryConfigured() {
    try {
        const cfg = getZillizConfig();
        return Boolean(cfg.configured && cfg.enabled !== false);
    } catch {
        return false;
    }
}

module.exports = {
    ensureMemoryCollection,
    upsertMemoryVector,
    deleteMemoryVector,
    deleteAllMemoryVectorsForUser,
    searchMemoryVectors,
    listMemoryVectorsForUser,
    embedMemoryText,
    isZillizMemoryConfigured,
    userFilter,
    normalizeUserId,
};
