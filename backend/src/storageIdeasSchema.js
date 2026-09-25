const STORAGE_IDEAS_DDL = `
CREATE TABLE IF NOT EXISTS storage_favorite_prompts (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS storage_favorite_prompts_email
ON storage_favorite_prompts(email, created_at DESC);

CREATE TABLE IF NOT EXISTS storage_chat_settings (
    email TEXT PRIMARY KEY,
    settings TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS storage_builder_projects (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS storage_builder_projects_email
ON storage_builder_projects(email, updated_at DESC);

CREATE TABLE IF NOT EXISTS storage_model_bookmarks (
    email TEXT NOT NULL,
    model_id TEXT NOT NULL,
    label TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (email, model_id)
);

CREATE TABLE IF NOT EXISTS storage_message_attachments (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    conversation_id TEXT,
    message_index INTEGER,
    file_name TEXT NOT NULL,
    mime_type TEXT,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS storage_message_attachments_email
ON storage_message_attachments(email, created_at DESC);

CREATE TABLE IF NOT EXISTS storage_training_runs (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    config TEXT NOT NULL,
    metrics TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS storage_training_runs_email
ON storage_training_runs(email, created_at DESC);
`;

const ensureStorageIdeasSchema = (database) => {
    database.exec(STORAGE_IDEAS_DDL);
};

module.exports = {
    ensureStorageIdeasSchema,
};
