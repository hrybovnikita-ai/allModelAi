/**
 * Admin audit log — who used ADMIN_KEY / admin actions.
 * Never stores private chat message content.
 */

const SQLITE_DDL = `
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    metadata TEXT,
    ip TEXT,
    correlation_id TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_audit_logs_created
ON admin_audit_logs(created_at DESC);
`;

const POSTGRES_DDL = `
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
`;

function ensureAdminAuditSchema(database) {
    if (!database?.exec) return;
    database.exec(SQLITE_DDL);
}

module.exports = {
    SQLITE_DDL,
    POSTGRES_DDL,
    ensureAdminAuditSchema,
};
