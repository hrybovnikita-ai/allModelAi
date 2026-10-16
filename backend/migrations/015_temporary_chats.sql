-- Temporary chats: 72-hour server-side expiry (fixed from creation; messages do not extend).

ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS is_temporary BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS conversations_temporary_expires
ON conversations(expires_at)
WHERE is_temporary = TRUE;

CREATE INDEX IF NOT EXISTS conversations_owner_temporary
ON conversations(email, is_temporary, updated_at DESC);
