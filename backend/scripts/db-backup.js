#!/usr/bin/env node
/**
 * Local / ops database backup helper (Phase 1).
 *
 * Postgres (DATABASE_URL set):
 *   uses pg_dump when available on PATH
 *
 * SQLite (no DATABASE_URL):
 *   copies DB_FILE (or default sqlite path) to a timestamped file
 *
 * NEVER commit backup output. Keep dumps outside the git tree.
 *
 * Usage:
 *   node scripts/db-backup.js
 *   node scripts/db-backup.js --out ./backups
 *   node scripts/db-backup.js --dry-run
 *
 * Restore (Postgres):
 *   psql "$DATABASE_URL" < backups/allmodelai-YYYYMMDD-HHMMSS.sql
 *   then: npm run db:migrate
 *
 * Restore (SQLite):
 *   stop the server, replace DB_FILE with the .sqlite copy, restart
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

require('./load-backend-env').loadBackendEnv();

const { resolveDatabaseUrl } = require('../src/db/provider');

function stamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

function parseArgs(argv) {
    const outIdx = argv.indexOf('--out');
    const outDir = outIdx >= 0 ? argv[outIdx + 1] : path.join(process.cwd(), 'backups');
    return {
        outDir,
        dryRun: argv.includes('--dry-run'),
    };
}

function resolveSqlitePath() {
    const fromEnv = String(process.env.DB_FILE || '').trim();
    if (fromEnv) {
        return path.isAbsolute(fromEnv) ? fromEnv : path.resolve(process.cwd(), fromEnv);
    }
    return path.join(__dirname, '..', 'data', 'allmodelai.sqlite');
}

function main() {
    const { outDir, dryRun } = parseArgs(process.argv.slice(2));
    const resolved = resolveDatabaseUrl();
    const ts = stamp();

    if (!fs.existsSync(outDir) && !dryRun) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    if (resolved?.url) {
        const target = path.join(outDir, `allmodelai-pg-${ts}.sql`);
        if (dryRun) {
            console.log(JSON.stringify({
                status: 'dry-run',
                engine: 'postgres',
                wouldWrite: target,
                configuredFrom: resolved.source,
                note: 'Requires pg_dump on PATH. Never commit the dump file.',
            }, null, 2));
            return;
        }
        const result = spawnSync('pg_dump', [resolved.url, '--no-owner', '--no-acl', '-f', target], {
            encoding: 'utf8',
            env: process.env,
        });
        if (result.error || result.status !== 0) {
            const detail = result.error?.message || result.stderr || result.stdout || 'pg_dump failed';
            throw new Error(
                `Postgres backup failed. Install PostgreSQL client tools (pg_dump) or run manually. ${detail}`,
            );
        }
        console.log(JSON.stringify({
            status: 'ok',
            engine: 'postgres',
            file: target,
            bytes: fs.statSync(target).size,
            configuredFrom: resolved.source,
        }, null, 2));
        return;
    }

    const sqlitePath = resolveSqlitePath();
    const target = path.join(outDir, `allmodelai-sqlite-${ts}.sqlite`);
    if (dryRun) {
        console.log(JSON.stringify({
            status: 'dry-run',
            engine: 'sqlite',
            source: sqlitePath,
            wouldWrite: target,
            sourceExists: fs.existsSync(sqlitePath),
            note: 'Never commit the backup file.',
        }, null, 2));
        return;
    }
    if (!fs.existsSync(sqlitePath)) {
        throw new Error(`SQLite database not found at ${sqlitePath}`);
    }
    fs.copyFileSync(sqlitePath, target);
    console.log(JSON.stringify({
        status: 'ok',
        engine: 'sqlite',
        source: sqlitePath,
        file: target,
        bytes: fs.statSync(target).size,
    }, null, 2));
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error(JSON.stringify({ status: 'error', message: error.message }, null, 2));
        process.exit(1);
    }
}

module.exports = {
    stamp,
    parseArgs,
    resolveSqlitePath,
    main,
};
