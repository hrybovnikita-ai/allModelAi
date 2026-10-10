const fs = require('node:fs');
const path = require('node:path');
const { queryPgPool, resolvePostgresAsyncPool } = require('./pgPoolQuery');

const AI_IMPROVEMENT_MIGRATION = path.join(__dirname, '..', '..', 'migrations', '003_ai_improvement.sql');
const VIDEO_JOBS_MIGRATION = path.join(__dirname, '..', '..', 'migrations', '005_video_generation.sql');

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

    const sql = fs.readFileSync(AI_IMPROVEMENT_MIGRATION, 'utf8');
    const statements = sql
        .split(';')
        .map((part) => part.replace(/^--[^\n]*\n?/gm, '').trim())
        .filter(Boolean);

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

async function runMigrationFile(pool, filePath) {
    const sql = fs.readFileSync(filePath, 'utf8');
    const statements = sql
        .split(';')
        .map((part) => part.replace(/^--[^\n]*\n?/gm, '').trim())
        .filter(Boolean);
    for (const statement of statements) {
        await queryPgPool(pool, `${statement};`);
    }
}

async function ensurePostgresVideoJobsAsync(connection) {
    if (!isPostgresEngine(connection)) return { applied: false, reason: 'not_postgres' };
    const pool = resolvePostgresAsyncPool(connection);
    if (!pool) return { applied: false, reason: 'pool_unavailable' };
    await runMigrationFile(pool, VIDEO_JOBS_MIGRATION);
    return { applied: true };
}

module.exports = {
    ensurePostgresAiImprovementAsync,
    ensurePostgresVideoJobsAsync,
};
