const path = require('node:path');

const DEFAULT_MAX_UPLOAD_BYTES = Math.min(
    Math.max(parseInt(process.env.PLATFORM_MAX_UPLOAD_BYTES || String(25 * 1024 * 1024), 10), 1024 * 1024),
    100 * 1024 * 1024,
);

const KNOWLEDGE_ROOT = path.join(__dirname, '..', '..', 'storage', 'knowledge');
const VIDEO_ROOT = path.join(__dirname, '..', '..', 'storage', 'generated-videos');
const CODE_ARTIFACTS_ROOT = path.join(__dirname, '..', '..', 'storage', 'code-artifacts');

const SAFE_TEXT_EXTENSIONS = new Set([
    '.txt', '.md', '.markdown', '.csv', '.json', '.py', '.js', '.jsx', '.ts', '.tsx',
    '.html', '.css', '.xml', '.yaml', '.yml', '.log', '.sql',
]);

const SAFE_MIME_PREFIXES = ['text/', 'application/json', 'application/pdf'];

function isSafeTextExtension(filename) {
    const ext = path.extname(String(filename || '')).toLowerCase();
    return SAFE_TEXT_EXTENSIONS.has(ext);
}

function summarizeStoragePolicy() {
    return {
        maxUploadBytes: DEFAULT_MAX_UPLOAD_BYTES,
        knowledgeRoot: 'storage/knowledge',
        videoRoot: 'storage/generated-videos',
        codeArtifactsRoot: 'storage/code-artifacts',
        safeTextExtensions: [...SAFE_TEXT_EXTENSIONS],
        storeLargeBinariesOnDisk: true,
        storeDocumentBodiesInPostgres: false,
    };
}

module.exports = {
    DEFAULT_MAX_UPLOAD_BYTES,
    KNOWLEDGE_ROOT,
    VIDEO_ROOT,
    CODE_ARTIFACTS_ROOT,
    isSafeTextExtension,
    summarizeStoragePolicy,
};
