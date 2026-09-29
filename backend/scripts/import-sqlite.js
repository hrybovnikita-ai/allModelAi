#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { Pool } = require('pg');
const { requireDatabaseUrl } = require('../src/db/provider');

const defaultSqlitePath = path.join(__dirname, '..', 'storage', 'database.sqlite');

function parseArgs(argv) {
    const args = {
        dryRun: true,
        sqlitePath: process.env.SQLITE_IMPORT_PATH
            ? path.resolve(process.env.SQLITE_IMPORT_PATH)
            : defaultSqlitePath,
        profile: 'production-worthy',
    };
    for (const arg of argv) {
        if (arg === '--apply') {
            args.dryRun = false;
        } else if (arg === '--dry-run') {
            args.dryRun = true;
        } else if (arg.startsWith('--sqlite=')) {
            args.sqlitePath = path.resolve(arg.slice('--sqlite='.length));
        } else if (arg.startsWith('--profile=')) {
            args.profile = arg.slice('--profile='.length);
        }
    }
    return args;
}

function classifyUser(email) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized.includes('@')) {
        return 'invalid';
    }
    if (normalized.endsWith('@example.com')) {
        return 'test_example_domain';
    }
    if (normalized.endsWith('@test.com')) {
        return 'test_domain';
    }
    const local = normalized.split('@')[0];
    if (/^wfpdbg/i.test(local)) {
        return 'test_wayforpay_debug';
    }
    if (/^live\d+@ex\.com$/.test(normalized)) {
        return 'test_live_checkout';
    }
    return 'production_worthy';
}

function shouldImportUser(row, profile) {
    const bucket = classifyUser(row.email);
    if (profile === 'all-non-example') {
        return bucket !== 'test_example_domain' && bucket !== 'invalid';
    }
    return bucket === 'production_worthy';
}

async function upsertUser(client, user) {
    await client.query(`
        INSERT INTO users (
            id, name, email, password_hash, email_verified, role, avatar_url
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO NOTHING
    `, [
        user.id,
        user.name,
        user.email,
        user.password_hash,
        user.email_verified ?? 0,
        user.role ?? 'user',
        user.avatar_url ?? null,
    ]);
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!fs.existsSync(args.sqlitePath)) {
        throw new Error(`SQLite file not found: ${args.sqlitePath}`);
    }

    const sqlite = new Database(args.sqlitePath, { readonly: true });
    const allUsers = sqlite.prepare(`
        SELECT id, name, email, password_hash, email_verified, role, avatar_url
        FROM users
        ORDER BY id
    `).all();

    const buckets = {};
    for (const user of allUsers) {
        const key = classifyUser(user.email);
        buckets[key] = (buckets[key] || 0) + 1;
    }

    const selected = allUsers.filter((user) => shouldImportUser(user, args.profile));
    const selectedIds = new Set(selected.map((user) => user.id));
    const selectedEmails = new Set(selected.map((user) => String(user.email).toLowerCase()));

    const authSessions = selectedIds.size
        ? sqlite.prepare(`
            SELECT token_hash, user_id, expires_at
            FROM auth_sessions
            WHERE user_id IN (${[...selectedIds].map(() => '?').join(',')})
        `).all(...selectedIds)
        : [];

    const subscriptions = selectedEmails.size
        ? sqlite.prepare(`
            SELECT email, plan FROM subscriptions
            WHERE lower(email) IN (${[...selectedEmails].map(() => '?').join(',')})
        `).all(...[...selectedEmails])
        : [];

    console.log(JSON.stringify({
        mode: args.dryRun ? 'dry-run' : 'apply',
        sqlitePath: args.sqlitePath,
        profile: args.profile,
        totals: {
            usersInSqlite: allUsers.length,
            usersSelected: selected.length,
            authSessionsSelected: authSessions.length,
            subscriptionsSelected: subscriptions.length,
        },
        userBuckets: buckets,
        selectedUserIds: selected.map((user) => user.id),
        selectedEmails: selected.map((user) => user.email),
        note: 'Password hashes are never printed. Source SQLite is read-only.',
    }, null, 2));

    if (args.dryRun) {
        sqlite.close();
        return;
    }

    const connectionString = requireDatabaseUrl();
    const useSsl = process.env.DATABASE_SSL !== 'false';
    const pool = new Pool({
        connectionString,
        ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const user of selected) {
            await upsertUser(client, user);
        }
        for (const session of authSessions) {
            await client.query(`
                INSERT INTO auth_sessions (token_hash, user_id, expires_at)
                VALUES ($1, $2, $3)
                ON CONFLICT (token_hash) DO NOTHING
            `, [session.token_hash, session.user_id, session.expires_at]);
        }
        for (const row of subscriptions) {
            await client.query(`
                INSERT INTO subscriptions (email, plan)
                VALUES ($1, $2)
                ON CONFLICT (email) DO NOTHING
            `, [row.email, row.plan]);
        }
        await client.query(`
            SELECT setval(
                pg_get_serial_sequence('users', 'id'),
                COALESCE((SELECT MAX(id) FROM users), 1)
            )
        `);
        await client.query('COMMIT');
        console.log(JSON.stringify({
            status: 'imported',
            users: selected.length,
            authSessions: authSessions.length,
            subscriptions: subscriptions.length,
        }, null, 2));
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
        await pool.end();
        sqlite.close();
    }
}

main().catch((error) => {
    console.error('Import failed:', error.message);
    process.exit(1);
});
