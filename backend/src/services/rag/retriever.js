const { embedText, cosineSimilarity, parseEmbedding } = require('./embeddingProvider');

const DEFAULT_TOP_K = Math.min(Math.max(parseInt(process.env.KB_TOP_K || '6', 10), 1), 20);

async function rankChunks(query, chunkRows, topK = DEFAULT_TOP_K) {
    const queryEmbed = await embedText(query);
    const scored = chunkRows.map((row) => {
        const stored = parseEmbedding(row.embedding_json);
        const vector = stored?.vector;
        let score = 0;
        if (vector) {
            score = cosineSimilarity(queryEmbed.vector, vector);
        } else {
            const terms = String(query).toLowerCase().split(/\s+/).filter(Boolean);
            const text = String(row.text || '').toLowerCase();
            score = terms.filter((t) => text.includes(t)).length / Math.max(terms.length, 1);
        }
        return { row, score };
    });

    return scored
        .filter((item) => item.score > 0.05)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(({ row, score }) => ({
            id: row.document_id,
            chunkId: row.id,
            name: row.document_name || 'Document',
            score: Number(score.toFixed(4)),
            excerpt: String(row.text || '').trim().slice(0, 1200),
            pageNumber: row.page_number,
            sectionLabel: row.section_label,
        }));
}

module.exports = {
    DEFAULT_TOP_K,
    rankChunks,
};
