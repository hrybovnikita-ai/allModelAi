const SQLITE_DDL = `
CREATE TABLE IF NOT EXISTS ai_workflows (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    graph_json TEXT NOT NULL,
    template_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_workflows_owner ON ai_workflows(email, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_workflow_runs (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    email TEXT NOT NULL,
    status TEXT NOT NULL,
    progress_json TEXT,
    result_json TEXT,
    error_message TEXT,
    budget_tokens INTEGER,
    used_tokens INTEGER DEFAULT 0,
    cancel_requested INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_workflow_runs_owner ON ai_workflow_runs(email, created_at DESC);
`;

const POSTGRES_DDL = `
CREATE TABLE IF NOT EXISTS ai_workflows (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    graph_json JSONB NOT NULL,
    template_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_workflows_owner ON ai_workflows(email, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_workflow_runs (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    email TEXT NOT NULL,
    status TEXT NOT NULL,
    progress_json JSONB,
    result_json JSONB,
    error_message TEXT,
    budget_tokens INTEGER,
    used_tokens INTEGER DEFAULT 0,
    cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_workflow_runs_owner ON ai_workflow_runs(email, created_at DESC);
`;

function ensureWorkflowSchema(database) {
    if (!database?.exec) return;
    database.exec(SQLITE_DDL);
}

module.exports = {
    SQLITE_DDL,
    POSTGRES_DDL,
    ensureWorkflowSchema,
};
