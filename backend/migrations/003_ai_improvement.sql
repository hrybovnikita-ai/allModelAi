-- Opt-in user memory, response feedback, knowledge visibility (PostgreSQL)

CREATE TABLE IF NOT EXISTS user_ai_settings (
    email TEXT PRIMARY KEY,
    memory_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    share_feedback BOOLEAN NOT NULL DEFAULT TRUE,
    exclude_temporary_from_memory BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_ai_memories (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    content_encrypted TEXT NOT NULL,
    content_preview TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'user',
    source_conversation_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS response_feedback_owner
ON response_feedback(email, created_at DESC);

CREATE INDEX IF NOT EXISTS response_feedback_rating
ON response_feedback(rating, created_at DESC);

ALTER TABLE knowledge_documents
ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private';
