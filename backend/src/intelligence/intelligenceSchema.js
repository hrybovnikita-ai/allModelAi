const INTELLIGENCE_SQLITE_DDL = `
CREATE TABLE IF NOT EXISTS knowledge_collections (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS knowledge_collections_owner
ON knowledge_collections(email, updated_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_retrieval_evals (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    dataset_version TEXT NOT NULL,
    query TEXT NOT NULL,
    expected_chunk_ids TEXT NOT NULL DEFAULT '[]',
    retrieved_chunk_ids TEXT NOT NULL DEFAULT '[]',
    metrics TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS router_routing_policies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'candidate',
    config TEXT NOT NULL DEFAULT '{}',
    promoted_by TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS intelligence_user_settings (
    email TEXT PRIMARY KEY,
    allow_eval_dataset INTEGER NOT NULL DEFAULT 0,
    allow_router_learning INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS eval_benchmark_runs (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    suite TEXT NOT NULL,
    dataset_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    summary TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    finished_at TEXT
);

CREATE TABLE IF NOT EXISTS eval_benchmark_results (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    case_id TEXT NOT NULL,
    model_id TEXT,
    outcome TEXT NOT NULL,
    score REAL,
    details TEXT NOT NULL DEFAULT '{}',
    latency_ms INTEGER,
    judge_version TEXT,
    rubric_version TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(run_id) REFERENCES eval_benchmark_runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS eval_human_reviews (
    id TEXT PRIMARY KEY,
    result_id TEXT NOT NULL,
    reviewer_email TEXT NOT NULL,
    decision TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(result_id) REFERENCES eval_benchmark_results(id) ON DELETE CASCADE
);
`;

function ensureIntelligenceColumns(database) {
    const hasDocs = database.prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'knowledge_documents'",
    ).get();
    if (!hasDocs) return;
    const docCols = new Set(database.prepare('PRAGMA table_info(knowledge_documents)').all().map((r) => r.name));
    const additions = [
        ['collection_id', 'TEXT'],
        ['content_checksum', 'TEXT'],
        ['embedding_model', 'TEXT'],
        ['embedding_version', 'TEXT'],
        ['index_status', "TEXT NOT NULL DEFAULT 'ready'"],
    ];
    for (const [name, type] of additions) {
        if (!docCols.has(name)) {
            database.exec(`ALTER TABLE knowledge_documents ADD COLUMN ${name} ${type}`);
        }
    }
}

function ensureIntelligenceSchema(database) {
    database.exec(INTELLIGENCE_SQLITE_DDL);
    ensureIntelligenceColumns(database);
}

module.exports = {
    ensureIntelligenceSchema,
    ensureIntelligenceColumns,
};
