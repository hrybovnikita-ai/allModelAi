/**
 * Schema for AllModelAI user memory vectors in Zilliz / Milvus.
 * Dimension is locked to the active free embedding provider (local-hash-v1).
 */

const { EMBEDDING_DIM } = require('../rag/embeddingProvider');

const MEMORY_COLLECTION = String(process.env.ZILLIZ_COLLECTION || 'allmodelai_user_memory').trim()
    || 'allmodelai_user_memory';

/** Must match embedText() default when OpenAI embeddings are not forced. */
const MEMORY_EMBEDDING_MODEL = 'local-hash-v1';
const MEMORY_EMBEDDING_DIM = EMBEDDING_DIM; // 256 — from embeddingProvider.js, not guessed

const FIELD = {
    id: 'id',
    userId: 'user_id',
    contentPreview: 'content_preview',
    sourceType: 'source_type',
    embeddingModel: 'embedding_model',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    embedding: 'embedding',
};

function assertEmbeddingCompatible(record) {
    const vector = record?.vector;
    if (!Array.isArray(vector) || vector.length !== MEMORY_EMBEDDING_DIM) {
        const err = new Error(
            `Embedding dimension mismatch: expected ${MEMORY_EMBEDDING_DIM} (${MEMORY_EMBEDDING_MODEL}), got ${vector?.length ?? 0}`,
        );
        err.code = 'MEMORY_EMBEDDING_DIM_MISMATCH';
        throw err;
    }
    if (record.model && record.model !== MEMORY_EMBEDDING_MODEL) {
        const err = new Error(
            `Embedding model mismatch: memory collection expects ${MEMORY_EMBEDDING_MODEL}, got ${record.model}`,
        );
        err.code = 'MEMORY_EMBEDDING_PROVIDER_MISMATCH';
        throw err;
    }
    return true;
}

function buildCollectionFields(DataType) {
    return [
        {
            name: FIELD.id,
            data_type: DataType.VarChar,
            is_primary_key: true,
            max_length: 64,
        },
        {
            name: FIELD.userId,
            data_type: DataType.VarChar,
            max_length: 320,
        },
        {
            name: FIELD.contentPreview,
            data_type: DataType.VarChar,
            max_length: 500,
        },
        {
            name: FIELD.sourceType,
            data_type: DataType.VarChar,
            max_length: 64,
        },
        {
            name: FIELD.embeddingModel,
            data_type: DataType.VarChar,
            max_length: 64,
        },
        {
            name: FIELD.createdAt,
            data_type: DataType.Int64,
        },
        {
            name: FIELD.updatedAt,
            data_type: DataType.Int64,
        },
        {
            name: FIELD.embedding,
            data_type: DataType.FloatVector,
            dim: MEMORY_EMBEDDING_DIM,
        },
    ];
}

function getSchemaReport() {
    return {
        collection: MEMORY_COLLECTION,
        embeddingModel: MEMORY_EMBEDDING_MODEL,
        embeddingDim: MEMORY_EMBEDDING_DIM,
        metric: 'COSINE',
        fields: Object.values(FIELD),
        chatInjectionEnabled: String(process.env.ZILLIZ_MEMORY_CHAT_INJECTION || '').toLowerCase() === 'true',
        note: 'Full memory text remains encrypted in SQL; Zilliz stores vectors + safe preview for the owning user only.',
    };
}

module.exports = {
    MEMORY_COLLECTION,
    MEMORY_EMBEDDING_MODEL,
    MEMORY_EMBEDDING_DIM,
    FIELD,
    assertEmbeddingCompatible,
    buildCollectionFields,
    getSchemaReport,
};
