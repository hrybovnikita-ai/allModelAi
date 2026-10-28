const { isPostgresConnection } = require('../db/postgresHttpReads');

function ensureSqliteTable(connection) {
    if (isPostgresConnection(connection)) return;
    const db = connection.database;
    if (!db?.exec) return;
    db.exec(`
        CREATE TABLE IF NOT EXISTS lemon_squeezy_webhook_events (
            event_id TEXT PRIMARY KEY,
            event_type TEXT,
            processed_at TEXT NOT NULL
        );
    `);
}

async function ensurePostgresTable(connection) {
    const { queryPgPool, resolvePostgresAsyncPool } = require('../db/pgPoolQuery');
    const pool = resolvePostgresAsyncPool(connection);
    await queryPgPool(
        pool,
        `CREATE TABLE IF NOT EXISTS lemon_squeezy_webhook_events (
            event_id TEXT PRIMARY KEY,
            event_type TEXT,
            processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
    );
    return pool;
}

async function claimLemonSqueezyEvent(connection, eventId, eventType) {
    const id = String(eventId || '').trim();
    if (!id) return false;
    ensureSqliteTable(connection);
    const now = new Date().toISOString();
    if (isPostgresConnection(connection)) {
        const { queryPgPool } = require('../db/pgPoolQuery');
        const pool = await ensurePostgresTable(connection);
        const res = await queryPgPool(
            pool,
            `INSERT INTO lemon_squeezy_webhook_events (event_id, event_type, processed_at)
             VALUES ($1, $2, $3)
             ON CONFLICT (event_id) DO NOTHING
             RETURNING event_id`,
            [id, String(eventType || ''), now],
        );
        return (res.rowCount ?? 0) > 0;
    }
    try {
        connection.database
            .prepare('INSERT INTO lemon_squeezy_webhook_events (event_id, event_type, processed_at) VALUES (?, ?, ?)')
            .run(id, String(eventType || ''), now);
        return true;
    } catch (error) {
        if (/UNIQUE/i.test(String(error.message || ''))) return false;
        throw error;
    }
}

module.exports = {
    claimLemonSqueezyEvent,
};
