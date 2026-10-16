/**
 * Safe text extraction for AI File Manager.
 * Never executes uploaded content — text/CSV/PDF-text/DOCX XML only.
 */

const path = require('node:path');

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt', '.csv', '.md', '.markdown']);
const ALLOWED_MIME = new Set([
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/csv',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const MAX_EXTRACT_CHARS = Math.min(
    Number(process.env.AI_FILES_MAX_CHARS || 500_000),
    1_000_000,
);

function normalizeExtension(filename, mimeType) {
    const ext = path.extname(String(filename || '')).toLowerCase();
    if (ALLOWED_EXTENSIONS.has(ext)) return ext;
    const mime = String(mimeType || '').toLowerCase();
    if (mime.includes('pdf')) return '.pdf';
    if (mime.includes('wordprocessingml') || mime.includes('docx')) return '.docx';
    if (mime.includes('csv')) return '.csv';
    if (mime.includes('markdown')) return '.md';
    if (mime.startsWith('text/')) return '.txt';
    return ext;
}

function assertAllowedUpload({ filename, mimeType, byteLength }) {
    const ext = normalizeExtension(filename, mimeType);
    const mime = String(mimeType || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext) && !ALLOWED_MIME.has(mime) && !mime.startsWith('text/')) {
        const error = new Error('Unsupported file type. Allowed: PDF, DOCX, TXT, CSV.');
        error.status = 400;
        error.code = 'INVALID_FILE_TYPE';
        throw error;
    }
    const maxBytes = Number(process.env.AI_FILES_MAX_BYTES || 15 * 1024 * 1024);
    if (byteLength != null && Number(byteLength) > maxBytes) {
        const error = new Error(`File exceeds maximum size of ${maxBytes} bytes.`);
        error.status = 413;
        error.code = 'PAYLOAD_TOO_LARGE';
        throw error;
    }
    return { ext, mime };
}

function extractPlainText(raw, { filename, mimeType } = {}) {
    const { ext } = assertAllowedUpload({ filename, mimeType, byteLength: Buffer.byteLength(String(raw || ''), 'utf8') });
    let text = String(raw || '');

    if (ext === '.csv') {
        // Keep CSV as plain text for chunking; do not execute formulas.
        text = text.replace(/^\uFEFF/, '');
    } else if (ext === '.docx') {
        // Best-effort: if client already sent extracted text, keep it.
        // Binary DOCX without client extraction is rejected rather than executed.
        if (/PK\x03\x04/.test(text.slice(0, 4)) || text.includes('\u0000')) {
            const error = new Error('DOCX must be uploaded as extracted text. Use the AI Files page to parse locally first.');
            error.status = 400;
            error.code = 'DOCX_EXTRACT_REQUIRED';
            throw error;
        }
    } else if (ext === '.pdf') {
        if (text.includes('\u0000') || /^%PDF-/.test(text.slice(0, 8))) {
            const error = new Error('PDF must be uploaded as extracted text. Use the AI Files page to parse locally first.');
            error.status = 400;
            error.code = 'PDF_EXTRACT_REQUIRED';
            throw error;
        }
    }

    text = text.replace(/\0/g, '').trim();
    if (!text) {
        const error = new Error('Could not extract text from file.');
        error.status = 400;
        error.code = 'PARSE_FAILURE';
        throw error;
    }
    if (text.length > MAX_EXTRACT_CHARS) {
        text = text.slice(0, MAX_EXTRACT_CHARS);
    }
    return { text, ext, truncated: text.length >= MAX_EXTRACT_CHARS };
}

module.exports = {
    ALLOWED_EXTENSIONS,
    ALLOWED_MIME,
    MAX_EXTRACT_CHARS,
    assertAllowedUpload,
    extractPlainText,
    normalizeExtension,
};
