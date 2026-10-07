const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { isPostgresConnection } = require('../../db/postgresHttpReads');
const { splitPagesIntoChunks, splitTextIntoChunks } = require('./chunking');
const { embedText, serializeEmbedding } = require('./embeddingProvider');
const { rankChunks, DEFAULT_TOP_K } = require('./retriever');

const MAX_UPLOAD_CHARS = Math.min(
    Math.max(parseInt(process.env.KB_MAX_CHARS || '300000', 10), 1000),
    500000,
);

function storageRoot() {
    return path.join(__dirname, '..', '..', '..', 'storage', 'knowledge');
}

function sanitizeFilename(name) {
    return String(name || 'document')
        .replace(/[^\w.\- ()[\]]+/g, '_')
        .slice(0, 180);
}

async function listDocuments(connection, email) {
    const normalized = String(email).trim().toLowerCase();
    if (isPostgresConnection(connection)) {
        const result = await connection.pool.query(
            `SELECT id, name, mime_type AS "mimeType", status, page_count AS "pageCount",
                    char_count AS "charCount", chunk_count AS "chunkCount", created_at AS "createdAt", updated_at AS "updatedAt"
             FROM knowledge_documents WHERE email = $1 ORDER BY updated_at DESC`,
            [normalized],
        );
        return result.rows;
    }
    return connection.database.prepare(
        `SELECT id, name, mime_type AS mimeType, status, page_count AS pageCount,
                char_count AS charCount, chunk_count AS chunkCount, created_at AS createdAt, updated_at AS updatedAt
         FROM knowledge_documents WHERE email = ? ORDER BY updated_at DESC`,
    ).all(normalized);
}

async function getChunksForEmail(connection, email) {
    const normalized = String(email).trim().toLowerCase();
    if (isPostgresConnection(connection)) {
        const result = await connection.pool.query(
            `SELECT c.id, c.document_id, c.chunk_index, c.page_number, c.section_label, c.text, c.embedding_json,
                    d.name AS document_name
             FROM knowledge_chunks c
             JOIN knowledge_documents d ON d.id = c.document_id
             WHERE c.email = $1 AND d.status = 'ready'`,
            [normalized],
        );
        return result.rows;
    }
    return connection.database.prepare(
        `SELECT c.id, c.document_id, c.chunk_index, c.page_number, c.section_label, c.text, c.embedding_json,
                d.name AS document_name
         FROM knowledge_chunks c
         JOIN knowledge_documents d ON d.id = c.document_id
         WHERE c.email = ? AND d.status = 'ready'`,
    ).all(normalized);
}

async function deleteDocument(connection, email, documentId) {
    const normalized = String(email).trim().toLowerCase();
    if (isPostgresConnection(connection)) {
        const row = await connection.pool.query(
            'SELECT storage_path FROM knowledge_documents WHERE id = $1 AND email = $2',
            [documentId, normalized],
        );
        await connection.pool.query('DELETE FROM knowledge_documents WHERE id = $1 AND email = $2', [documentId, normalized]);
        const storagePath = row.rows[0]?.storage_path;
        if (storagePath && fs.existsSync(storagePath)) fs.unlinkSync(storagePath);
        return { deleted: true };
    }
    const row = connection.database.prepare(
        'SELECT storage_path FROM knowledge_documents WHERE id = ? AND email = ?',
    ).get(documentId, normalized);
    connection.database.prepare('DELETE FROM knowledge_documents WHERE id = ? AND email = ?').run(documentId, normalized);
    if (row?.storage_path && fs.existsSync(row.storage_path)) fs.unlinkSync(row.storage_path);
    return { deleted: true };
}

async function indexDocument(connection, email, input) {
    const normalized = String(email).trim().toLowerCase();
    const name = sanitizeFilename(input.name);
    const mimeType = String(input.mimeType || 'text/plain').slice(0, 120);
    const pages = Array.isArray(input.pages) ? input.pages : null;
    const content = String(input.content || '').slice(0, MAX_UPLOAD_CHARS);
    if (!content.trim()) {
        throw Object.assign(new Error('Document has no extractable text.'), { status: 400 });
    }

    const id = input.id || `kb-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const chunks = pages?.length
        ? splitPagesIntoChunks(pages)
        : splitTextIntoChunks(content).map((c) => ({ ...c, pageNumber: 1 }));

    const dir = path.join(storageRoot(), normalized.replace(/[^a-z0-9@._-]/gi, '_'));
    fs.mkdirSync(dir, { recursive: true });
    const storagePath = path.join(dir, `${id}.json`);
    fs.writeFileSync(storagePath, JSON.stringify({ name, pages, content: content.slice(0, 50000) }), 'utf8');

    if (isPostgresConnection(connection)) {
        await connection.pool.query(
            `INSERT INTO knowledge_documents
             (id, email, name, mime_type, status, page_count, char_count, chunk_count, storage_path, created_at, updated_at)
             VALUES ($1,$2,$3,$4,'processing',$5,$6,0,$7,$8,$8)
             ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, mime_type = EXCLUDED.mime_type,
             status = 'processing', page_count = EXCLUDED.page_count, char_count = EXCLUDED.char_count,
             storage_path = EXCLUDED.storage_path, updated_at = EXCLUDED.updated_at`,
            [id, normalized, name, mimeType, pages?.length || 1, content.length, storagePath, now],
        );
        await connection.pool.query('DELETE FROM knowledge_chunks WHERE document_id = $1 AND email = $2', [id, normalized]);
    } else {
        connection.database.prepare(
            `INSERT INTO knowledge_documents
             (id, email, name, mime_type, status, page_count, char_count, chunk_count, storage_path, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'processing', ?, ?, 0, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET name = excluded.name, mime_type = excluded.mime_type,
             status = 'processing', page_count = excluded.page_count, char_count = excluded.char_count,
             storage_path = excluded.storage_path, updated_at = excluded.updated_at`,
        ).run(id, normalized, name, mimeType, pages?.length || 1, content.length, storagePath, now, now);
        connection.database.prepare('DELETE FROM knowledge_chunks WHERE document_id = ? AND email = ?').run(id, normalized);
    }

    let inserted = 0;
    for (const chunk of chunks) {
        const chunkId = `${id}:${chunk.chunkIndex}`;
        const embedding = await embedText(chunk.text);
        const embeddingJson = serializeEmbedding(embedding);
        if (isPostgresConnection(connection)) {
            await connection.pool.query(
                `INSERT INTO knowledge_chunks
                 (id, document_id, email, chunk_index, page_number, section_label, text, embedding_json, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
                [
                    chunkId,
                    id,
                    normalized,
                    chunk.chunkIndex,
                    chunk.pageNumber || null,
                    chunk.sectionLabel || null,
                    chunk.text,
                    embeddingJson,
                    now,
                ],
            );
        } else {
            connection.database.prepare(
                `INSERT INTO knowledge_chunks
                 (id, document_id, email, chunk_index, page_number, section_label, text, embedding_json, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ).run(
                chunkId,
                id,
                normalized,
                chunk.chunkIndex,
                chunk.pageNumber || null,
                chunk.sectionLabel || null,
                chunk.text,
                embeddingJson,
                now,
            );
        }
        inserted += 1;
    }

    if (isPostgresConnection(connection)) {
        await connection.pool.query(
            `UPDATE knowledge_documents SET status = 'ready', chunk_count = $1, updated_at = $2 WHERE id = $3 AND email = $4`,
            [inserted, now, id, normalized],
        );
    } else {
        connection.database.prepare(
            'UPDATE knowledge_documents SET status = ?, chunk_count = ?, updated_at = ? WHERE id = ? AND email = ?',
        ).run('ready', inserted, now, id, normalized);
    }

    return { id, name, chunkCount: inserted, status: 'ready' };
}

async function retrieveForQuery(connection, email, query, limit = DEFAULT_TOP_K) {
    const rows = await getChunksForEmail(connection, email);
    if (!rows.length) return [];
    return rankChunks(query, rows, limit);
}

async function answerWithKnowledge(connection, email, query, limit = DEFAULT_TOP_K) {
    const sources = await retrieveForQuery(connection, email, query, limit);
    if (!sources.length) {
        return {
            grounded: false,
            message: 'The Knowledge Base did not contain enough information to answer confidently.',
            sources: [],
        };
    }
    const context = sources
        .map((s, i) => `[${i + 1}] ${s.name}${s.pageNumber ? ` — page ${s.pageNumber}` : ''}: ${s.excerpt}`)
        .join('\n\n');
    return {
        grounded: true,
        contextBlock: context,
        sources: sources.map((s, i) => ({
            rank: i + 1,
            documentId: s.id,
            documentName: s.name,
            pageNumber: s.pageNumber,
            sectionLabel: s.sectionLabel,
            excerpt: s.excerpt,
            score: s.score,
        })),
    };
}

module.exports = {
    MAX_UPLOAD_CHARS,
    listDocuments,
    indexDocument,
    deleteDocument,
    retrieveForQuery,
    answerWithKnowledge,
};
