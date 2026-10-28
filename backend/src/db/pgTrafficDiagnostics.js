const startedAt = Date.now();

const stats = {
    queries: 0,
    estimatedBytesOut: 0,
    estimatedBytesIn: 0,
    byOperation: {},
    lastQueryAt: null,
};

function normalizeSqlSnippet(text) {
    return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 160);
}

function classifyOperation(text) {
    const snippet = String(text || '').trim();
    const upper = snippet.slice(0, 12).toUpperCase();
    if (upper.startsWith('SELECT')) return 'select';
    if (upper.startsWith('INSERT')) return 'insert';
    if (upper.startsWith('UPDATE')) return 'update';
    if (upper.startsWith('DELETE')) return 'delete';
    return 'other';
}

function estimateRowBytes(rows) {
    if (!rows?.length) return 0;
    try {
        return Buffer.byteLength(JSON.stringify(rows), 'utf8');
    } catch {
        return 0;
    }
}

function estimateValuesBytes(values) {
    if (!values?.length) return 0;
    try {
        return Buffer.byteLength(JSON.stringify(values), 'utf8');
    } catch {
        return 0;
    }
}

function recordPgQuery(text, values, result) {
    stats.queries += 1;
    stats.lastQueryAt = new Date().toISOString();
    const bytesOut = estimateRowBytes(result?.rows);
    const bytesIn = estimateValuesBytes(values);
    stats.estimatedBytesOut += bytesOut;
    stats.estimatedBytesIn += bytesIn;
    const op = classifyOperation(text);
    if (!stats.byOperation[op]) {
        stats.byOperation[op] = { queries: 0, estimatedBytesOut: 0 };
    }
    stats.byOperation[op].queries += 1;
    stats.byOperation[op].estimatedBytesOut += bytesOut;
}

function getPgTrafficSnapshot() {
    return {
        since: new Date(startedAt).toISOString(),
        uptimeMs: Date.now() - startedAt,
        queries: stats.queries,
        estimatedBytesOut: stats.estimatedBytesOut,
        estimatedBytesIn: stats.estimatedBytesIn,
        estimatedMegabytesOut: Number((stats.estimatedBytesOut / (1024 * 1024)).toFixed(4)),
        byOperation: { ...stats.byOperation },
        lastQueryAt: stats.lastQueryAt,
        note: 'Estimated from API result payloads only; Supabase dashboard egress may differ (pooler, SSL, replicas).',
    };
}

function resetPgTrafficStats() {
    stats.queries = 0;
    stats.estimatedBytesOut = 0;
    stats.estimatedBytesIn = 0;
    stats.byOperation = {};
    stats.lastQueryAt = null;
}

module.exports = {
    recordPgQuery,
    getPgTrafficSnapshot,
    resetPgTrafficStats,
    normalizeSqlSnippet,
};
