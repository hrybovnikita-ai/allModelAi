-- Atomic credit reservations for AI chat (reserve → settle / release).
CREATE TABLE IF NOT EXISTS ai_credit_reservations (
    reference_id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    reserved_amount INTEGER NOT NULL,
    settled_amount INTEGER,
    status TEXT NOT NULL DEFAULT 'reserved',
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_credit_reservations_email_status
ON ai_credit_reservations(email, status);
