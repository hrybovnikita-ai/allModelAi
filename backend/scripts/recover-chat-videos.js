#!/usr/bin/env node
/**
 * Rehydrate chat messages from completed video_generation_jobs (no new provider jobs).
 * Usage: node scripts/recover-chat-videos.js [email]
 */
require('../scripts/load-backend-env').loadBackendEnv();
const app = require('../app');
const { normalizeMessages } = require('../src/services/chatMessageNormalize');
const { hydrateConversationMessages } = require('../src/services/chatVideoHydration');
const { isPostgresConnection } = require('../src/db/postgresHttpReads');
const { queryPgPool, resolvePostgresAsyncPool } = require('../src/db/pgPoolQuery');
const { ensurePostgresVideoJobsAsync } = require('../src/db/postgresSchemaBootstrap');

async function main() {
    const email = (process.argv[2] || '').trim().toLowerCase();
    if (!email) {
        console.error('Usage: node scripts/recover-chat-videos.js <email>');
        process.exit(1);
    }
    const connection = app.locals.db;
    if (!isPostgresConnection(connection)) {
        console.error('Recovery requires PostgreSQL.');
        process.exit(1);
    }
    await ensurePostgresVideoJobsAsync(connection);
    const pool = resolvePostgresAsyncPool(connection);
    const rows = await queryPgPool(
        pool,
        `SELECT id, email, messages, updated_at FROM conversations WHERE lower(email) = lower($1) ORDER BY updated_at DESC`,
        [email],
    );
    let repaired = 0;
    for (const row of rows.rows) {
        let rawMessages = [];
        try {
            rawMessages = JSON.parse(row.messages || '[]');
        } catch {
            continue;
        }
        const normalized = normalizeMessages(rawMessages);
        const hydrated = await hydrateConversationMessages(connection, email, normalized, {
            conversationId: row.id,
        });
        const before = JSON.stringify(normalized);
        const after = JSON.stringify(hydrated);
        if (before === after) continue;
        await queryPgPool(
            pool,
            `UPDATE conversations SET messages = $1, updated_at = $2 WHERE id = $3 AND lower(email) = lower($4)`,
            [JSON.stringify(hydrated), new Date().toISOString(), row.id, email],
        );
        repaired += 1;
        console.log(`[RECOVER] Updated conversation ${row.id}`);
    }
    console.log(`[RECOVER] Done. Conversations updated: ${repaired}`);
    connection.close?.();
}

main().catch((error) => {
    console.error('[RECOVER] Failed:', error.message);
    process.exit(1);
});
