const DEFAULT_CHUNK_SIZE = Math.min(
    Math.max(parseInt(process.env.KB_CHUNK_SIZE || '900', 10), 200),
    4000,
);
const DEFAULT_CHUNK_OVERLAP = Math.min(
    Math.max(parseInt(process.env.KB_CHUNK_OVERLAP || '120', 10), 0),
    800,
);

function splitTextIntoChunks(text, size = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_CHUNK_OVERLAP) {
    const normalized = String(text || '').replace(/\r\n/g, '\n').trim();
    if (!normalized) return [];

    const chunks = [];
    const step = Math.max(size - overlap, 1);
    for (let start = 0; start < normalized.length; start += step) {
        const piece = normalized.slice(start, start + size).trim();
        if (piece) {
            chunks.push({
                chunkIndex: chunks.length,
                text: piece,
                start,
            });
        }
        if (chunks.length >= 500) break;
    }
    return chunks;
}

/**
 * Split page-aware content (from PDF extraction) into chunks with page metadata.
 * @param {{ page: number, text: string }[]} pages
 */
function splitPagesIntoChunks(pages, size = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_CHUNK_OVERLAP) {
    const all = [];
    for (const page of pages || []) {
        const pageNum = Number(page.page) || 1;
        const parts = splitTextIntoChunks(page.text, size, overlap);
        parts.forEach((part) => {
            all.push({
                ...part,
                pageNumber: pageNum,
            });
        });
    }
    return all.map((chunk, index) => ({ ...chunk, chunkIndex: index }));
}

module.exports = {
    DEFAULT_CHUNK_SIZE,
    DEFAULT_CHUNK_OVERLAP,
    splitTextIntoChunks,
    splitPagesIntoChunks,
};
