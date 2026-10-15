const { isPostgresConnection } = require('../db/postgresHttpReads');

function ensureCreemWebhookEventsTable(connection) {
    if (isPostgresConnection(connection)) return;
    const db = connection.database;
    if (!db?.exec) return;
    db.exec(`
        CREATE TABLE IF NOT EXISTS creem_webhook_events (
            event_id TEXT PRIMARY KEY,
            event_type TEXT,
            processed_at TEXT NOT NULL
        );
    `);
}

async function ensurePostgresWebhookTable(connection) {
    const { queryPgPool, resolvePostgresAsyncPool } = require('../db/pgPoolQuery');
    const pool = resolvePostgresAsyncPool(connection);
    await queryPgPool(
        pool,
        `CREATE TABLE IF NOT EXISTS creem_webhook_events (
            event_id TEXT PRIMARY KEY,
            event_type TEXT,
            processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
    );
    return pool;
}

async function wasCreemEventProcessed(connection, eventId) {
    const id = String(eventId || '').trim();
    if (!id) return false;
    ensureCreemWebhookEventsTable(connection);
    if (isPostgresConnection(connection)) {
        const { queryPgPool } = require('../db/pgPoolQuery');
        const pool = await ensurePostgresWebhookTable(connection);
        const res = await queryPgPool(pool, 'SELECT event_id FROM creem_webhook_events WHERE event_id = $1', [id]);
        return (res.rows?.length || 0) > 0;
    }
    const row = connection.database
        .prepare('SELECT event_id FROM creem_webhook_events WHERE event_id = ?')
        .get(id);
    return Boolean(row);
}

/**
 * Atomically claim an event id. Returns true only for the first claimant.
 * Prevents concurrent webhook deliveries from double-handling side effects.
 */
async function claimCreemEvent(connection, eventId, eventType) {
    const id = String(eventId || '').trim();
    if (!id) return false;
    ensureCreemWebhookEventsTable(connection);
    const now = new Date().toISOString();
    if (isPostgresConnection(connection)) {
        const { queryPgPool } = require('../db/pgPoolQuery');
        const pool = await ensurePostgresWebhookTable(connection);
        const res = await queryPgPool(
            pool,
            `INSERT INTO creem_webhook_events (event_id, event_type, processed_at)
             VALUES ($1, $2, $3) ON CONFLICT (event_id) DO NOTHING
             RETURNING event_id`,
            [id, eventType || null, now],
        );
        return (res.rows?.length || 0) > 0;
    }
    const result = connection.database
        .prepare('INSERT OR IGNORE INTO creem_webhook_events (event_id, event_type, processed_at) VALUES (?, ?, ?)')
        .run(id, eventType || null, now);
    return Number(result.changes || 0) > 0;
}

async function markCreemEventProcessed(connection, eventId, eventType) {
    await claimCreemEvent(connection, eventId, eventType);
}

/** Release a claim so Creem can retry after a transient handler failure. */
async function releaseCreemEventClaim(connection, eventId) {
    const id = String(eventId || '').trim();
    if (!id) return;
    ensureCreemWebhookEventsTable(connection);
    if (isPostgresConnection(connection)) {
        const { queryPgPool } = require('../db/pgPoolQuery');
        const pool = await ensurePostgresWebhookTable(connection);
        await queryPgPool(pool, 'DELETE FROM creem_webhook_events WHERE event_id = $1', [id]);
        return;
    }
    connection.database.prepare('DELETE FROM creem_webhook_events WHERE event_id = ?').run(id);
}

module.exports = {
    claimCreemEvent,
    ensureCreemWebhookEventsTable,
    markCreemEventProcessed,
    releaseCreemEventClaim,
    wasCreemEventProcessed,
};
