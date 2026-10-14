const { isPostgresConnection } = require('../db/postgresHttpReads');

const SQLITE_DDL = `
CREATE TABLE IF NOT EXISTS ai_credit_balances (
    email TEXT PRIMARY KEY,
    balance INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_credit_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    entry_type TEXT NOT NULL,
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    reference_id TEXT NOT NULL UNIQUE,
    metadata TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_credit_ledger_email_created
ON ai_credit_ledger(email, created_at DESC);
`;

const POSTGRES_DDL = `
CREATE TABLE IF NOT EXISTS ai_credit_balances (
    email TEXT PRIMARY KEY,
    balance INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_credit_ledger (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    entry_type TEXT NOT NULL,
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    reference_id TEXT NOT NULL UNIQUE,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_credit_ledger_email_created
ON ai_credit_ledger(email, created_at DESC);
`;

function ensureAiCreditSchema(connection) {
    if (!connection) return;
    if (isPostgresConnection(connection)) {
        const { queryPgPool, resolvePostgresAsyncPool } = require('../db/pgPoolQuery');
        const pool = resolvePostgresAsyncPool(connection);
        return queryPgPool(pool, POSTGRES_DDL);
    }
    connection.database.exec(SQLITE_DDL);
}

module.exports = {
    ensureAiCreditSchema,
};
