/**
 * Privacy-conscious memory ranking for chat context injection.
 * Lexical ranking only (no mandatory embedding provider).
 */

const SENSITIVE_PATTERNS = [
    /\bsk-[a-zA-Z0-9]{10,}\b/,
    /\b(api[_-]?key|secret|password|passwd|token)\s*[:=]\s*\S+/i,
    /\b(Bearer)\s+[A-Za-z0-9\-._~+/]+=*/i,
    /\b(?:\d[ -]*?){13,19}\b/, // card-like digit runs
    /\bcvv\s*[:=]?\s*\d{3,4}\b/i,
    /\bssn\s*[:=]?\s*\d{3}-?\d{2}-?\d{4}\b/i,
];

const MAX_CONTEXT_CHARS = Number(process.env.AI_MEMORY_CONTEXT_CHARS || 1800);
const MAX_MEMORIES_INJECTED = Number(process.env.AI_MEMORY_MAX_INJECTED || 8);

function tokenize(text) {
    return String(text || '')
        .toLowerCase()
        .split(/[^a-z0-9а-яёїієґ]+/i)
        .filter((t) => t.length > 2);
}

function containsSensitiveContent(text) {
    const value = String(text || '');
    if (!value.trim()) return false;
    return SENSITIVE_PATTERNS.some((re) => re.test(value));
}

function scoreMemoryAgainstQuery(memoryText, queryTokens) {
    if (!queryTokens.length) return 1;
    const memTokens = new Set(tokenize(memoryText));
    if (!memTokens.size) return 0;
    let hits = 0;
    for (const token of queryTokens) {
        if (memTokens.has(token)) hits += 1;
    }
    const overlap = hits / queryTokens.length;
    const freshnessBoost = 0; // caller may pass ordered list (newest first)
    return overlap + freshnessBoost;
}

/**
 * Rank, filter sensitive content, dedupe, and fit into a character budget.
 * @returns {{ texts: string[], sources: Array<{ index: number, chars: number, score: number }> }}
 */
function rankAndSelectMemories(memories, query, {
    maxChars = MAX_CONTEXT_CHARS,
    maxItems = MAX_MEMORIES_INJECTED,
} = {}) {
    const list = Array.isArray(memories) ? memories : [];
    const queryTokens = tokenize(query);
    const seen = new Set();
    const scored = [];

    list.forEach((raw, index) => {
        const text = String(raw || '').trim();
        if (!text) return;
        if (containsSensitiveContent(text)) return;
        const key = text.toLowerCase().slice(0, 160);
        if (seen.has(key)) return;
        seen.add(key);
        const score = scoreMemoryAgainstQuery(text, queryTokens) + Math.max(0, 0.05 * (list.length - index) / list.length);
        scored.push({ text, score, index });
    });

    scored.sort((a, b) => b.score - a.score);

    const texts = [];
    const sources = [];
    let used = 0;
    for (const item of scored) {
        if (texts.length >= maxItems) break;
        const nextLen = item.text.length + (texts.length ? 2 : 0);
        if (used + nextLen > maxChars) {
            if (!texts.length && maxChars > 40) {
                const clipped = item.text.slice(0, maxChars - 1);
                texts.push(clipped);
                sources.push({ index: item.index, chars: clipped.length, score: Number(item.score.toFixed(3)) });
            }
            break;
        }
        texts.push(item.text);
        sources.push({ index: item.index, chars: item.text.length, score: Number(item.score.toFixed(3)) });
        used += nextLen;
    }

    return { texts, sources };
}

module.exports = {
    containsSensitiveContent,
    rankAndSelectMemories,
    tokenize,
    MAX_CONTEXT_CHARS,
    MAX_MEMORIES_INJECTED,
};
