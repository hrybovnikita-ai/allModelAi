-- Knowledge learning, router experiments, self-evaluation (PostgreSQL)

CREATE TABLE IF NOT EXISTS knowledge_collections (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS knowledge_collections_owner
ON knowledge_collections(email, updated_at DESC);

ALTER TABLE knowledge_documents
ADD COLUMN IF NOT EXISTS collection_id TEXT REFERENCES knowledge_collections(id) ON DELETE SET NULL;

ALTER TABLE knowledge_documents
ADD COLUMN IF NOT EXISTS content_checksum TEXT;

ALTER TABLE knowledge_documents
ADD COLUMN IF NOT EXISTS embedding_model TEXT;

ALTER TABLE knowledge_documents
ADD COLUMN IF NOT EXISTS embedding_version TEXT;

ALTER TABLE knowledge_documents
ADD COLUMN IF NOT EXISTS index_status TEXT NOT NULL DEFAULT 'ready';

CREATE TABLE IF NOT EXISTS knowledge_retrieval_evals (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    dataset_version TEXT NOT NULL,
    query TEXT NOT NULL,
    expected_chunk_ids JSONB NOT NULL DEFAULT '[]',
    retrieved_chunk_ids JSONB NOT NULL DEFAULT '[]',
    metrics JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS knowledge_retrieval_evals_owner
ON knowledge_retrieval_evals(email, created_at DESC);

CREATE TABLE IF NOT EXISTS router_routing_policies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'candidate',
    config JSONB NOT NULL DEFAULT '{}',
    promoted_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS router_routing_policies_active
ON router_routing_policies(status)
WHERE status = 'active';

CREATE TABLE IF NOT EXISTS intelligence_user_settings (
    email TEXT PRIMARY KEY,
    allow_eval_dataset BOOLEAN NOT NULL DEFAULT FALSE,
    allow_router_learning BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS eval_benchmark_runs (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    suite TEXT NOT NULL,
    dataset_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    summary JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS eval_benchmark_runs_owner
ON eval_benchmark_runs(email, created_at DESC);

CREATE TABLE IF NOT EXISTS eval_benchmark_results (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES eval_benchmark_runs(id) ON DELETE CASCADE,
    case_id TEXT NOT NULL,
    model_id TEXT,
    outcome TEXT NOT NULL,
    score REAL,
    details JSONB NOT NULL DEFAULT '{}',
    latency_ms INTEGER,
    judge_version TEXT,
    rubric_version TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS eval_benchmark_results_run
ON eval_benchmark_results(run_id, created_at);

CREATE TABLE IF NOT EXISTS eval_human_reviews (
    id TEXT PRIMARY KEY,
    result_id TEXT NOT NULL REFERENCES eval_benchmark_results(id) ON DELETE CASCADE,
    reviewer_email TEXT NOT NULL,
    decision TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
