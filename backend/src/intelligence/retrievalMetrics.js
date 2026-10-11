/**
 * Labeled retrieval metrics only — no synthetic ground truth.
 */

function recallAtK(retrievedIds, expectedIds, k) {
    const expected = new Set(expectedIds.map(String));
    if (!expected.size) return null;
    const top = retrievedIds.slice(0, k).map(String);
    const hits = top.filter((id) => expected.has(id)).length;
    return hits / expected.size;
}

function precisionAtK(retrievedIds, expectedIds, k) {
    const expected = new Set(expectedIds.map(String));
    if (!k) return null;
    const top = retrievedIds.slice(0, k).map(String);
    if (!top.length) return 0;
    const hits = top.filter((id) => expected.has(id)).length;
    return hits / top.length;
}

function meanReciprocalRank(retrievedIds, expectedIds) {
    const expected = new Set(expectedIds.map(String));
    if (!expected.size) return null;
    for (let i = 0; i < retrievedIds.length; i++) {
        if (expected.has(String(retrievedIds[i]))) {
            return 1 / (i + 1);
        }
    }
    return 0;
}

function aggregateRetrievalMetrics(rows, k = 6) {
    const perQuery = rows.map((row) => {
        const retrieved = row.retrievedChunkIds || [];
        const expected = row.expectedChunkIds || [];
        return {
            query: row.query,
            recallAtK: recallAtK(retrieved, expected, k),
            precisionAtK: precisionAtK(retrieved, expected, k),
            mrr: meanReciprocalRank(retrieved, expected),
        };
    }).filter((r) => r.recallAtK != null);

    if (!perQuery.length) {
        return { sampleSize: 0, k, note: 'No labeled queries with expected chunk IDs.' };
    }

    const avg = (key) => perQuery.reduce((s, r) => s + r[key], 0) / perQuery.length;

    return {
        sampleSize: perQuery.length,
        k,
        recallAtK: Number(avg('recallAtK').toFixed(4)),
        precisionAtK: Number(avg('precisionAtK').toFixed(4)),
        mrr: Number(avg('mrr').toFixed(4)),
        queries: perQuery,
    };
}

module.exports = {
    recallAtK,
    precisionAtK,
    meanReciprocalRank,
    aggregateRetrievalMetrics,
};
