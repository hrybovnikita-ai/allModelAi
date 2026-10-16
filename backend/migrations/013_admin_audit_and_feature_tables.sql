-- Phase 1: admin audit logs (no private message content).
-- Safe additive migration for PostgreSQL deployments.

CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    metadata JSONB,
    ip TEXT,
    correlation_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_audit_logs_created
ON admin_audit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS admin_audit_logs_actor
ON admin_audit_logs(actor, created_at DESC);
