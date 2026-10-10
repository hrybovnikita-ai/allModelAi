const AI_IMPROVEMENT_DDL = `
CREATE TABLE IF NOT EXISTS user_ai_settings (
    email TEXT PRIMARY KEY,
    memory_enabled INTEGER NOT NULL DEFAULT 0,
    share_feedback INTEGER NOT NULL DEFAULT 1,
    exclude_temporary_from_memory INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_ai_memories (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    content_encrypted TEXT NOT NULL,
    content_preview TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'user',
    source_conversation_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS user_ai_memories_owner
ON user_ai_memories(email, updated_at DESC);

CREATE TABLE IF NOT EXISTS response_feedback (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    conversation_id TEXT,
    message_index INTEGER,
    rating TEXT NOT NULL,
    reason_category TEXT,
    correction_text TEXT,
    model_slug TEXT,
    routed_model TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS response_feedback_owner
ON response_feedback(email, created_at DESC);

CREATE INDEX IF NOT EXISTS response_feedback_rating
ON response_feedback(rating, created_at DESC);
`;

function ensureAiImprovementSchema(database) {
    database.exec(AI_IMPROVEMENT_DDL);
    try {
        database.exec(`ALTER TABLE knowledge_documents ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'`);
    } catch {
        /* column exists */
    }
}

module.exports = {
    AI_IMPROVEMENT_DDL,
    ensureAiImprovementSchema,
};
