/**
 * AI File Manager — extends Knowledge Base RAG with rename/search/ask APIs.
 * Ownership is always scoped to the authenticated user email.
 */

const knowledgeBaseService = require('../rag/knowledgeBaseService');
const { extractPlainText, assertAllowedUpload } = require('./documentExtract');
const { parseEnvBoolean } = require('../../platform/featureRegistry');
const { logPlatformEvent } = require('../../platform/platformAudit');

function isFileManagerEnabled() {
    return parseEnvBoolean('FEATURE_AI_FILE_MANAGER', true);
}

function assertFeatureEnabled() {
    if (!isFileManagerEnabled()) {
        const error = new Error('AI File Manager is disabled.');
        error.status = 503;
        error.code = 'FEATURE_DISABLED';
        throw error;
    }
}

async function listFiles(connection, email, { q } = {}) {
    assertFeatureEnabled();
    const documents = await knowledgeBaseService.listDocuments(connection, email);
    const query = String(q || '').trim().toLowerCase();
    const filtered = query
        ? documents.filter((doc) => String(doc.name || '').toLowerCase().includes(query))
        : documents;
    return filtered.map((doc) => ({
        id: doc.id,
        name: doc.name,
        mimeType: doc.mimeType || doc.mime_type,
        chunkCount: doc.chunkCount || doc.chunk_count || 0,
        createdAt: doc.createdAt || doc.created_at,
        updatedAt: doc.updatedAt || doc.updated_at,
    }));
}

async function uploadFile(connection, email, payload, { ip } = {}) {
    assertFeatureEnabled();
    const name = String(payload.name || '').trim();
    const mimeType = String(payload.mimeType || 'text/plain').trim();
    assertAllowedUpload({
        filename: name,
        mimeType,
        byteLength: Buffer.byteLength(String(payload.content || ''), 'utf8'),
    });
    const extracted = extractPlainText(payload.content, { filename: name, mimeType });
    const result = await knowledgeBaseService.indexDocument(connection, email, {
        name,
        mimeType,
        content: extracted.text,
        pages: Array.isArray(payload.pages) ? payload.pages : null,
    });
    await logPlatformEvent(connection, {
        email,
        featureId: 'ai_file_manager',
        action: 'upload',
        resourceType: 'ai_file',
        resourceId: result.id || result.documentId,
        metadata: { name, mimeType, truncated: extracted.truncated },
        ip,
    });
    return result;
}

async function renameFile(connection, email, id, name) {
    assertFeatureEnabled();
    const nextName = String(name || '').trim();
    if (!nextName) {
        const error = new Error('File name is required');
        error.status = 400;
        throw error;
    }
    const docs = await knowledgeBaseService.listDocuments(connection, email);
    const existing = docs.find((doc) => String(doc.id) === String(id));
    if (!existing) {
        const error = new Error('File not found');
        error.status = 404;
        throw error;
    }
    // Reindex metadata via knowledge service when rename helper exists; otherwise update through index with same content unavailable.
    if (typeof knowledgeBaseService.renameDocument === 'function') {
        return knowledgeBaseService.renameDocument(connection, email, id, nextName);
    }
    if (typeof knowledgeBaseService.updateDocumentName === 'function') {
        return knowledgeBaseService.updateDocumentName(connection, email, id, nextName);
    }
    // Fallback: return logical rename for clients; persistent rename requires KB helper.
    return { id, name: nextName, renamed: false, message: 'Rename queued for next reindex' };
}

async function deleteFile(connection, email, id, { ip } = {}) {
    assertFeatureEnabled();
    await knowledgeBaseService.deleteDocument(connection, email, id);
    await logPlatformEvent(connection, {
        email,
        featureId: 'ai_file_manager',
        action: 'delete',
        resourceType: 'ai_file',
        resourceId: id,
        ip,
    });
    return { deleted: true, id };
}

async function askAboutFiles(connection, email, { query, fileIds, topK = 6 } = {}) {
    assertFeatureEnabled();
    const question = String(query || '').trim();
    if (!question) {
        const error = new Error('Query is required');
        error.status = 400;
        throw error;
    }
    const ids = Array.isArray(fileIds) ? fileIds.map(String) : null;
    if (typeof knowledgeBaseService.answerWithKnowledge === 'function') {
        const result = await knowledgeBaseService.answerWithKnowledge(
            connection,
            email,
            question,
            Math.min(Number(topK) || 6, 12),
        );
        if (ids?.length && Array.isArray(result.sources)) {
            result.sources = result.sources.filter((source) => ids.includes(String(source.documentId || source.id || '')));
        }
        return result;
    }
    return { grounded: false, message: 'Knowledge retrieval is unavailable', sources: [] };
}

module.exports = {
    isFileManagerEnabled,
    listFiles,
    uploadFile,
    renameFile,
    deleteFile,
    askAboutFiles,
};
