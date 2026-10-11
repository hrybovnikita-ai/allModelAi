-- Provider health: sanitized error events (no prompts or secrets)
CREATE TABLE IF NOT EXISTS provider_error_events (
    id BIGSERIAL PRIMARY KEY,
    provider_id TEXT NOT NULL,
    error_class TEXT NOT NULL,
    http_status INTEGER,
    sanitized_hint TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS provider_error_events_provider_created
ON provider_error_events(provider_id, created_at DESC);
