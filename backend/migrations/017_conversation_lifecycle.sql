-- Conversation lifecycle: active (default), archived, trashed (soft delete).

ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS trashed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS conversations_owner_lifecycle_updated
ON conversations(email, lifecycle_status, updated_at DESC);
