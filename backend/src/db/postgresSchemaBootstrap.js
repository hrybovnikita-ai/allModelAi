const fs = require('node:fs');
const path = require('node:path');
const { queryPgPool, resolvePostgresAsyncPool } = require('./pgPoolQuery');

const AI_IMPROVEMENT_MIGRATION = path.join(__dirname, '..', '..', 'migrations', '003_ai_improvement.sql');
const VIDEO_JOBS_MIGRATION = path.join(__dirname, '..', '..', 'migrations', '005_video_generation.sql');
const VIDEO_JOBS_CONVERSATION_MIGRATION = path.join(__dirname, '..', '..', 'migrations', '006_video_job_conversation.sql');
const PROVIDER_HEALTH_MIGRATION = path.join(__dirname, '..', '..', 'migrations', '009_provider_health.sql');
const ANONIN_ROUTING_MIGRATION = path.join(__dirname, '..', '..', 'migrations', '011_anonin_routing.sql');
const TEMPORARY_CHATS_MIGRATION = path.join(__dirname, '..', '..', 'migrations', '015_temporary_chats.sql');

function isPostgresEngine(connection) {
    return (connection?.engine || 'sqlite') === 'postgres';
}

/**
 * Ensures AI memory / feedback tables exist on PostgreSQL (SQLite gets these via ensureAiImprovementSchema).
 */
async function ensurePostgresAiImprovementAsync(connection) {
    if (!isPostgresEngine(connection)) return { applied: false, reason: 'not_postgres' };
    const pool = resolvePostgresAsyncPool(connection);
    if (!pool) {
        return { applied: false, reason: 'pool_unavailable' };
    }

    const statements = splitSqlStatements(fs.readFileSync(AI_IMPROVEMENT_MIGRATION, 'utf8'));

    for (const statement of statements) {
        try {
            await queryPgPool(pool, `${statement};`);
        } catch (error) {
            const code = String(error?.code || '');
            const message = String(error?.message || '');
            if (/knowledge_documents/i.test(statement) && (code === '42P01' || /knowledge_documents/i.test(message))) {
                continue;
            }
            throw error;
        }
    }

    return { applied: true };
}

function splitSqlStatements(sql) {
    // Strip full-line SQL comments first so semicolons inside comments cannot
    // split ALTER/CREATE statements (regression: 015_temporary_chats.sql).
    const withoutLineComments = String(sql || '')
        .split('\n')
        .map((line) => {
            const trimmed = line.trimStart();
            if (trimmed.startsWith('--')) return '';
            return line;
        })
        .join('\n');
    return withoutLineComments
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean);
}

async function runMigrationFile(pool, filePath) {
    const sql = fs.readFileSync(filePath, 'utf8');
    const statements = splitSqlStatements(sql);
    for (const statement of statements) {
        await queryPgPool(pool, `${statement};`);
    }
}

async function ensurePostgresVideoJobsAsync(connection) {
    if (!isPostgresEngine(connection)) return { applied: false, reason: 'not_postgres' };
    const pool = resolvePostgresAsyncPool(connection);
    if (!pool) return { applied: false, reason: 'pool_unavailable' };
    await runMigrationFile(pool, VIDEO_JOBS_MIGRATION);
    if (fs.existsSync(VIDEO_JOBS_CONVERSATION_MIGRATION)) {
        await runMigrationFile(pool, VIDEO_JOBS_CONVERSATION_MIGRATION);
    }
    return { applied: true };
}

async function ensurePostgresProviderHealthAsync(connection) {
    if (!isPostgresEngine(connection)) return { applied: false, reason: 'not_postgres' };
    const pool = resolvePostgresAsyncPool(connection);
    if (!pool) return { applied: false, reason: 'pool_unavailable' };
    if (!fs.existsSync(PROVIDER_HEALTH_MIGRATION)) {
        return { applied: false, reason: 'migration_missing' };
    }
    await runMigrationFile(pool, PROVIDER_HEALTH_MIGRATION);
    return { applied: true };
}

async function ensurePostgresAnoninRoutingAsync(connection) {
    if (!isPostgresEngine(connection)) return { applied: false, reason: 'not_postgres' };
    const pool = resolvePostgresAsyncPool(connection);
    if (!pool) return { applied: false, reason: 'pool_unavailable' };
    if (!fs.existsSync(ANONIN_ROUTING_MIGRATION)) {
        return { applied: false, reason: 'migration_missing' };
    }
    await runMigrationFile(pool, ANONIN_ROUTING_MIGRATION);
    return { applied: true };
}

async function ensurePostgresTemporaryChatsAsync(connection) {
    if (!isPostgresEngine(connection)) return { applied: false, reason: 'not_postgres' };
    const pool = resolvePostgresAsyncPool(connection);
    if (!pool) return { applied: false, reason: 'pool_unavailable' };
    if (!fs.existsSync(TEMPORARY_CHATS_MIGRATION)) {
        return { applied: false, reason: 'migration_missing' };
    }
    await runMigrationFile(pool, TEMPORARY_CHATS_MIGRATION);
    // Verify required columns — older broken comment-splitting left expires_at without is_temporary.
    const check = await queryPgPool(
        pool,
        `SELECT
            EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'conversations' AND column_name = 'is_temporary'
            ) AS has_is_temporary,
            EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'conversations' AND column_name = 'expires_at'
            ) AS has_expires_at`,
    );
    const row = check.rows[0] || {};
    if (!row.has_is_temporary || !row.has_expires_at) {
        const error = new Error('conversations.is_temporary / expires_at missing after migration 015');
        error.code = 'TEMPORARY_CHAT_SCHEMA_INCOMPLETE';
        throw error;
    }
    return { applied: true, hasIsTemporary: true, hasExpiresAt: true };
}

module.exports = {
    ensurePostgresAiImprovementAsync,
    ensurePostgresVideoJobsAsync,
    ensurePostgresProviderHealthAsync,
    ensurePostgresAnoninRoutingAsync,
    ensurePostgresTemporaryChatsAsync,
    splitSqlStatements,
};
