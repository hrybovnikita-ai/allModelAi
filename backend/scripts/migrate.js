#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

require('./load-backend-env').loadBackendEnv();

const { resolveDatabaseUrl } = require('../src/db/provider');
const { createPgPool, formatSafePgFailure } = require('../src/db/pgConfig');

const migrationsDir = path.join(__dirname, '..', 'migrations');

async function main() {
    const resolved = resolveDatabaseUrl();
    if (!resolved) {
        throw new Error(
            'DATABASE_URL is required for migrations (also accepts POSTGRES_URL or SUPABASE_DATABASE_URL).',
        );
    }

    const pool = createPgPool(resolved.url);

    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);

        const files = fs.readdirSync(migrationsDir)
            .filter((name) => name.endsWith('.sql'))
            .sort();

        const applied = new Set(
            (await pool.query('SELECT id FROM schema_migrations ORDER BY id')).rows
                .map((row) => row.id),
        );

        let ran = 0;
        for (const file of files) {
            if (applied.has(file)) {
                continue;
            }
            const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                await client.query(sql);
                await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
                await client.query('COMMIT');
                ran += 1;
                console.log(`Applied migration: ${file}`);
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
        }

        const usersTable = await pool.query(`
            SELECT 1 AS ok
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'users'
            LIMIT 1
        `);
        if (!usersTable.rowCount) {
            throw new Error('Migration finished but public.users is missing.');
        }

        console.log(JSON.stringify({
            status: 'ok',
            engine: 'postgres',
            configuredFrom: resolved.source,
            migrationsAppliedThisRun: ran,
            totalMigrations: files.length,
            usersTable: true,
        }, null, 2));
    } finally {
        await pool.end();
    }
}

main().catch((error) => {
    console.error(formatSafePgFailure(error));
    process.exit(1);
});
