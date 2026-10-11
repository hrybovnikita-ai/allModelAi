const crypto = require('node:crypto');
const { isPostgresConnection } = require('../db/postgresHttpReads');
const { queryPgPool, resolvePostgresAsyncPool } = require('../db/pgPoolQuery');
const knowledgeBaseService = require('../services/rag/knowledgeBaseService');
const { aggregateRetrievalMetrics } = require('./retrievalMetrics');

async function pgQuery(connection, text, values = []) {
    return queryPgPool(resolvePostgresAsyncPool(connection), text, values);
}

function contentChecksum(content) {
    return crypto.createHash('sha256').update(String(content || ''), 'utf8').digest('hex');
}

async function listCollections(connection, email) {
    const normalized = String(email).trim().toLowerCase();
    if (isPostgresConnection(connection)) {
        const result = await pgQuery(
            connection,
            `SELECT id, name, description, created_at AS "createdAt", updated_at AS "updatedAt"
             FROM knowledge_collections WHERE email = $1 ORDER BY updated_at DESC`,
            [normalized],
        );
        return result.rows;
    }
    return connection.database.prepare(
        `SELECT id, name, description, created_at AS createdAt, updated_at AS updatedAt
         FROM knowledge_collections WHERE email = ? ORDER BY updated_at DESC`,
    ).all(normalized);
}

async function createCollection(connection, email, { name, description }) {
    const normalized = String(email).trim().toLowerCase();
    const id = `kbc-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const title = String(name || '').trim().slice(0, 120);
    if (!title) throw Object.assign(new Error('Collection name is required.'), { status: 400 });
    if (isPostgresConnection(connection)) {
        await pgQuery(
            connection,
            `INSERT INTO knowledge_collections (id, email, name, description, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$5)`,
            [id, normalized, title, description ? String(description).slice(0, 500) : null, now],
        );
    } else {
        connection.database.prepare(
            `INSERT INTO knowledge_collections (id, email, name, description, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(id, normalized, title, description ? String(description).slice(0, 500) : null, now, now);
    }
    return { id, name: title };
}

async function findDuplicateByChecksum(connection, email, checksum, excludeDocumentId) {
    const normalized = String(email).trim().toLowerCase();
    if (!checksum) return null;
    if (isPostgresConnection(connection)) {
        const result = await pgQuery(
            connection,
            `SELECT id, name, content_checksum AS "contentChecksum", updated_at AS "updatedAt"
             FROM knowledge_documents
             WHERE email = $1 AND content_checksum = $2 AND ($3::text IS NULL OR id <> $3)
             LIMIT 1`,
            [normalized, checksum, excludeDocumentId || null],
        );
        return result.rows[0] || null;
    }
    const row = connection.database.prepare(
        `SELECT id, name, content_checksum AS contentChecksum, updated_at AS updatedAt
         FROM knowledge_documents
         WHERE email = ? AND content_checksum = ? AND (? IS NULL OR id <> ?)
         LIMIT 1`,
    ).get(normalized, checksum, excludeDocumentId || null, excludeDocumentId || null);
    return row || null;
}

async function runRetrievalEval(connection, email, { datasetVersion, queries, topK = 6 }) {
    const normalized = String(email).trim().toLowerCase();
    const version = String(datasetVersion || 'manual').slice(0, 64);
    const labeled = (queries || []).filter(
        (q) => q?.query && Array.isArray(q.expectedChunkIds) && q.expectedChunkIds.length,
    );
    if (!labeled.length) {
        return {
            stored: 0,
            metrics: { sampleSize: 0, note: 'Provide queries with expectedChunkIds to compute metrics.' },
        };
    }

    const rows = [];
    const started = Date.now();
    for (const item of labeled) {
        const hits = await knowledgeBaseService.retrieveForQuery(connection, normalized, item.query, topK);
        const retrievedChunkIds = hits.map((h) => h.chunkId).filter(Boolean);
        const metrics = aggregateRetrievalMetrics([{
            query: item.query,
            expectedChunkIds: item.expectedChunkIds,
            retrievedChunkIds,
        }], topK);
        const evalId = `kbeval-${crypto.randomUUID()}`;
        const now = new Date().toISOString();
        const payload = {
            recallAtK: metrics.recallAtK,
            precisionAtK: metrics.precisionAtK,
            mrr: metrics.mrr,
            latencyMs: Date.now() - started,
        };
        if (isPostgresConnection(connection)) {
            await pgQuery(
                connection,
                `INSERT INTO knowledge_retrieval_evals
                 (id, email, dataset_version, query, expected_chunk_ids, retrieved_chunk_ids, metrics, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                [
                    evalId,
                    normalized,
                    version,
                    item.query,
                    JSON.stringify(item.expectedChunkIds),
                    JSON.stringify(retrievedChunkIds),
                    JSON.stringify(payload),
                    now,
                ],
            );
        } else {
            connection.database.prepare(
                `INSERT INTO knowledge_retrieval_evals
                 (id, email, dataset_version, query, expected_chunk_ids, retrieved_chunk_ids, metrics, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            ).run(
                evalId,
                normalized,
                version,
                item.query,
                JSON.stringify(item.expectedChunkIds),
                JSON.stringify(retrievedChunkIds),
                JSON.stringify(payload),
                now,
            );
        }
        rows.push({ evalId, query: item.query, ...payload, retrievedChunkIds });
    }

    const aggregate = aggregateRetrievalMetrics(
        labeled.map((item, i) => ({
            query: item.query,
            expectedChunkIds: item.expectedChunkIds,
            retrievedChunkIds: rows[i].retrievedChunkIds,
        })),
        topK,
    );

    return { stored: rows.length, metrics: aggregate, rows };
}

async function getKnowledgeLearningSummary(connection, email) {
    const docs = await knowledgeBaseService.listDocuments(connection, email);
    const collections = await listCollections(connection, email);
    return {
        documentCount: docs.length,
        readyDocuments: docs.filter((d) => d.status === 'ready').length,
        collectionCount: collections.length,
        collections: collections.slice(0, 20),
        recentDocuments: docs.slice(0, 10),
    };
}

module.exports = {
    contentChecksum,
    listCollections,
    createCollection,
    findDuplicateByChecksum,
    runRetrievalEval,
    getKnowledgeLearningSummary,
};
