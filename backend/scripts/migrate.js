#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { requireDatabaseUrl } = require('../src/db/provider');

const migrationsDir = path.join(__dirname, '..', 'migrations');

async function main() {
    const connectionString = requireDatabaseUrl();
    const useSsl = process.env.DATABASE_SSL !== 'false';
    const pool = new Pool({
        connectionString,
        ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    });

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

        console.log(JSON.stringify({
            status: 'ok',
            migrationsAppliedThisRun: ran,
            totalMigrations: files.length,
        }, null, 2));
    } finally {
        await pool.end();
    }
}

main().catch((error) => {
    console.error('Migration failed:', error.message);
    process.exit(1);
});
