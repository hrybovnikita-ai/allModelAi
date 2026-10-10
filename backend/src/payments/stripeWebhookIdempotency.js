/** Idempotent Stripe webhook processing (SQLite + Postgres). */

const { isPostgresConnection } = require('../db/postgresHttpReads');

function ensureWebhookEventsTable(connection) {
    if (isPostgresConnection(connection)) return;
    const db = connection.database;
    if (!db?.exec) return;
    db.exec(`
        CREATE TABLE IF NOT EXISTS stripe_webhook_events (
            event_id TEXT PRIMARY KEY,
            event_type TEXT,
            processed_at TEXT NOT NULL
        );
    `);
}

async function wasStripeEventProcessed(connection, eventId) {
    const id = String(eventId || '').trim();
    if (!id) return false;
    ensureWebhookEventsTable(connection);
    if (isPostgresConnection(connection)) {
        const { queryPgPool, resolvePostgresAsyncPool } = require('../db/pgPoolQuery');
        const pool = resolvePostgresAsyncPool(connection);
        await queryPgPool(
            pool,
            `CREATE TABLE IF NOT EXISTS stripe_webhook_events (
                event_id TEXT PRIMARY KEY,
                event_type TEXT,
                processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )`,
        );
        const res = await queryPgPool(pool, 'SELECT event_id FROM stripe_webhook_events WHERE event_id = $1', [id]);
        return (res.rows?.length || 0) > 0;
    }
    const row = connection.database
        .prepare('SELECT event_id FROM stripe_webhook_events WHERE event_id = ?')
        .get(id);
    return Boolean(row);
}

async function markStripeEventProcessed(connection, eventId, eventType) {
    const id = String(eventId || '').trim();
    if (!id) return;
    ensureWebhookEventsTable(connection);
    const now = new Date().toISOString();
    if (isPostgresConnection(connection)) {
        const { queryPgPool, resolvePostgresAsyncPool } = require('../db/pgPoolQuery');
        const pool = resolvePostgresAsyncPool(connection);
        await queryPgPool(
            pool,
            `INSERT INTO stripe_webhook_events (event_id, event_type, processed_at)
             VALUES ($1, $2, $3) ON CONFLICT (event_id) DO NOTHING`,
            [id, eventType || null, now],
        );
        return;
    }
    connection.database
        .prepare('INSERT OR IGNORE INTO stripe_webhook_events (event_id, event_type, processed_at) VALUES (?, ?, ?)')
        .run(id, eventType || null, now);
}

module.exports = {
    ensureWebhookEventsTable,
    wasStripeEventProcessed,
    markStripeEventProcessed,
};
