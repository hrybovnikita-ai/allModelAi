-- Smart Router 2.0, RAG knowledge base, multi-agent research telemetry (PostgreSQL)

CREATE TABLE IF NOT EXISTS knowledge_documents (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    mime_type TEXT,
    status TEXT NOT NULL DEFAULT 'ready',
    page_count INTEGER NOT NULL DEFAULT 0,
    char_count INTEGER NOT NULL DEFAULT 0,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    storage_path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS knowledge_documents_owner
ON knowledge_documents(email, updated_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    page_number INTEGER,
    section_label TEXT,
    text TEXT NOT NULL,
    embedding_json TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS knowledge_chunks_document
ON knowledge_chunks(document_id, chunk_index);

CREATE INDEX IF NOT EXISTS knowledge_chunks_owner
ON knowledge_chunks(email);

CREATE TABLE IF NOT EXISTS router_metrics (
    id BIGSERIAL PRIMARY KEY,
    email TEXT,
    task_type TEXT,
    provider TEXT,
    model TEXT,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    success INTEGER NOT NULL DEFAULT 1,
    fallback_used INTEGER NOT NULL DEFAULT 0,
    error_category TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS router_metrics_created
ON router_metrics(created_at DESC);

CREATE TABLE IF NOT EXISTS research_runs (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    query TEXT NOT NULL,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS research_steps (
    id BIGSERIAL PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
    agent TEXT NOT NULL,
    status TEXT NOT NULL,
    summary TEXT,
    payload_json TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS research_steps_run
ON research_steps(run_id, id);
