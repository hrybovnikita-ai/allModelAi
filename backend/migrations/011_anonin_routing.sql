-- Anonin Model: server-side routing identity (never exposed pre-reveal in public chat payloads).

CREATE TABLE IF NOT EXISTS anonin_conversation_state (
    conversation_id TEXT NOT NULL,
    email TEXT NOT NULL,
    assigned_slug TEXT NOT NULL,
    strategy TEXT NOT NULL DEFAULT 'random',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (conversation_id, email)
);

CREATE INDEX IF NOT EXISTS anonin_conversation_state_email
ON anonin_conversation_state(email);

CREATE TABLE IF NOT EXISTS anonin_message_identity (
    message_id TEXT PRIMARY KEY,
    conversation_id TEXT,
    email TEXT NOT NULL,
    actual_slug TEXT NOT NULL,
    provider_label TEXT NOT NULL,
    model_label TEXT NOT NULL,
    gateway_model_id TEXT,
    strategy TEXT NOT NULL DEFAULT 'random',
    fallback_from_slug TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revealed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS anonin_message_identity_owner
ON anonin_message_identity(email, conversation_id);
