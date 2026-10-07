/**
 * Embedding abstraction — local bag-of-words hash vectors by default.
 * Optional OpenAI embeddings when OPENAI_API_KEY is configured.
 */

const crypto = require('node:crypto');

const EMBEDDING_DIM = 256;

function tokenize(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 1);
}

/** Deterministic local embedding (no external API). */
function embedLocal(text) {
    const vector = new Array(EMBEDDING_DIM).fill(0);
    const tokens = tokenize(text);
    if (!tokens.length) return vector;
    tokens.forEach((token) => {
        const hash = crypto.createHash('sha256').update(token).digest();
        for (let i = 0; i < 8; i++) {
            const idx = hash[i] % EMBEDDING_DIM;
            vector[idx] += 1;
        }
    });
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
    return vector.map((v) => v / norm);
}

function cosineSimilarity(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot;
}

async function embedText(text) {
    const openAiKey = (process.env.OPENAI_API_KEY || process.env.OPEN_AI_API_KEY || '').trim();
    const model = (process.env.KB_EMBEDDING_MODEL || 'text-embedding-3-small').trim();
    if (openAiKey && process.env.KB_USE_OPENAI_EMBEDDINGS === 'true') {
        try {
            const response = await fetch('https://api.openai.com/v1/embeddings', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${openAiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ model, input: String(text).slice(0, 8000) }),
                signal: AbortSignal.timeout(20000),
            });
            if (response.ok) {
                const data = await response.json();
                const vector = data.data?.[0]?.embedding;
                if (Array.isArray(vector)) {
                    return { provider: 'openai', model, vector };
                }
            }
        } catch (error) {
            console.warn('[KB_EMBED]', error.message);
        }
    }
    return { provider: 'local-hash', model: 'local-hash-v1', vector: embedLocal(text) };
}

function serializeEmbedding(record) {
    return JSON.stringify({ provider: record.provider, model: record.model, vector: record.vector });
}

function parseEmbedding(json) {
    try {
        const parsed = JSON.parse(json);
        if (parsed?.vector) return parsed;
    } catch {
        return null;
    }
    return null;
}

module.exports = {
    embedText,
    embedLocal,
    cosineSimilarity,
    serializeEmbedding,
    parseEmbedding,
    EMBEDDING_DIM,
};
