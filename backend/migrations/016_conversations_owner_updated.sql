-- Speed up conversation history lists by owner + recency.
-- Safe / additive: CREATE INDEX IF NOT EXISTS only.

CREATE INDEX IF NOT EXISTS conversations_owner_updated
ON conversations(email, updated_at DESC);
