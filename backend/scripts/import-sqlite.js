#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { requireDatabaseUrl } = require('../src/db/provider');
const { createPgPool, formatSafePgFailure } = require('../src/db/pgConfig');
const {
    parseArgs,
    normalizeImportEmail,
    resolveSelectedUsers,
    buildEmailDryRunReport,
    classifyUser,
} = require('./import-sqlite-lib');

try {
    process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch (error) {
    if (error.code !== 'ENOENT') throw error;
}

const defaultSqlitePath = path.join(__dirname, '..', 'storage', 'database.sqlite');

function loadRelatedData(sqlite, selected) {
    const selectedIds = new Set(selected.map((user) => user.id));
    const selectedEmails = new Set(selected.map((user) => normalizeImportEmail(user.email)));

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

    let subscriptionDetails = [];
    const hasSubscriptionDetails = sqlite.prepare(`
        SELECT 1 AS ok
        FROM sqlite_master
        WHERE type = 'table' AND name = 'subscription_details'
    `).get();
    if (hasSubscriptionDetails && selectedEmails.size) {
        subscriptionDetails = sqlite.prepare(`
            SELECT *
            FROM subscription_details
            WHERE lower(email) IN (${[...selectedEmails].map(() => '?').join(',')})
        `).all(...[...selectedEmails]);
    }

    return { authSessions, subscriptions, subscriptionDetails };
}

async function insertUser(client, user) {
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

async function insertSubscriptionDetails(client, row) {
    await client.query(`
        INSERT INTO subscription_details (
            email, plan, billing_interval, request_limit, period_end,
            stripe_customer_id, stripe_subscription_id, status, updated_at,
            payment_provider, order_reference, payment_status, amount, currency, activated_at
        ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9,
            $10, $11, $12, $13, $14, $15
        )
        ON CONFLICT (email) DO NOTHING
    `, [
        row.email,
        row.plan,
        row.billing_interval,
        row.request_limit,
        row.period_end,
        row.stripe_customer_id,
        row.stripe_subscription_id,
        row.status,
        row.updated_at,
        row.payment_provider,
        row.order_reference,
        row.payment_status,
        row.amount,
        row.currency,
        row.activated_at,
    ]);
}

async function applyImport({ selected, authSessions, subscriptions, subscriptionDetails }) {
    const connectionString = requireDatabaseUrl();
    const pool = createPgPool(connectionString);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const user of selected) {
            await insertUser(client, user);
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
        for (const row of subscriptionDetails) {
            await insertSubscriptionDetails(client, row);
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
            subscriptionDetails: subscriptionDetails.length,
        }, null, 2));
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2), defaultSqlitePath);
    if (!fs.existsSync(args.sqlitePath)) {
        throw new Error(`SQLite file not found: ${args.sqlitePath}`);
    }

    const sqlite = new Database(args.sqlitePath, { readonly: true });
    const allUsers = sqlite.prepare(`
        SELECT id, name, email, password_hash, email_verified, role, avatar_url
        FROM users
        ORDER BY id
    `).all();

    const selection = resolveSelectedUsers(allUsers, {
        profile: args.profile,
        email: args.email,
    });

    if (selection.status === 'invalid_email') {
        console.log(JSON.stringify({
            mode: args.dryRun ? 'dry-run' : 'apply',
            filter: 'email',
            status: 'invalid_email',
            selectedEmail: selection.target,
        }, null, 2));
        sqlite.close();
        process.exitCode = 1;
        return;
    }

    if (selection.status === 'ambiguous') {
        console.error(JSON.stringify({
            status: 'ambiguous_email',
            selectedEmail: selection.target,
            duplicateUserIds: selection.duplicateIds,
            message: 'Multiple SQLite users share this email. Resolve duplicates before importing.',
        }, null, 2));
        sqlite.close();
        process.exitCode = 1;
        return;
    }

    if (selection.status === 'not_found') {
        console.log(JSON.stringify({
            mode: args.dryRun ? 'dry-run' : 'apply',
            filter: 'email',
            status: 'not_found',
            selectedEmail: selection.target,
            message: 'No SQLite user matched this email. PostgreSQL was not modified.',
        }, null, 2));
        sqlite.close();
        return;
    }

    const { authSessions, subscriptions, subscriptionDetails } = loadRelatedData(
        sqlite,
        selection.selected,
    );

    if (args.email) {
        console.log(JSON.stringify(buildEmailDryRunReport({
            args,
            selection,
            authSessions,
            subscriptions,
            subscriptionDetailsCount: subscriptionDetails.length,
        }), null, 2));
    } else {
        const buckets = {};
        for (const user of allUsers) {
            const key = classifyUser(user.email);
            buckets[key] = (buckets[key] || 0) + 1;
        }
        console.log(JSON.stringify({
            mode: args.dryRun ? 'dry-run' : 'apply',
            sqlitePath: args.sqlitePath,
            profile: args.profile,
            totals: {
                usersInSqlite: allUsers.length,
                usersSelected: selection.selected.length,
                authSessionsSelected: authSessions.length,
                subscriptionsSelected: subscriptions.length,
                subscriptionDetailsSelected: subscriptionDetails.length,
            },
            userBuckets: buckets,
            selectedUserIds: selection.selected.map((user) => user.id),
            selectedEmails: selection.selected.map((user) => user.email),
            note: 'Password hashes are never printed. Source SQLite is read-only.',
        }, null, 2));
    }

    if (args.dryRun) {
        sqlite.close();
        return;
    }

    try {
        await applyImport({
            selected: selection.selected,
            authSessions,
            subscriptions,
            subscriptionDetails,
        });
    } finally {
        sqlite.close();
    }
}

main().catch((error) => {
    console.error(formatSafePgFailure(error));
    process.exit(1);
});
