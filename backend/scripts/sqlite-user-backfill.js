const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const {
    normalizeImportEmail,
    resolveSelectedUsers,
} = require('./import-sqlite-lib');

const UPSERT_USER_BY_EMAIL_SQL = `
    INSERT INTO users (name, email, password_hash, email_verified, role, avatar_url)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (email) DO UPDATE SET
        name = COALESCE(NULLIF(BTRIM(users.name), ''), EXCLUDED.name),
        password_hash = COALESCE(NULLIF(BTRIM(users.password_hash), ''), EXCLUDED.password_hash),
        email_verified = GREATEST(COALESCE(users.email_verified, 0), COALESCE(EXCLUDED.email_verified, 0)),
        avatar_url = COALESCE(users.avatar_url, EXCLUDED.avatar_url),
        role = COALESCE(NULLIF(BTRIM(users.role), ''), EXCLUDED.role)
`;

function resolveSqliteBackfillPath() {
    const configured = process.env.SQLITE_IMPORT_PATH?.trim()
        || process.env.DB_FILE?.trim();
    if (configured) {
        return path.resolve(configured);
    }
    return path.join(__dirname, '..', 'storage', 'database.sqlite');
}

function isBackfillEnabled() {
    const flag = String(process.env.BACKFILL_SQLITE_USERS || 'auto').trim().toLowerCase();
    return flag !== 'false' && flag !== '0' && flag !== 'off';
}

function loadSqliteUsers(sqlitePath) {
    const sqlite = new Database(sqlitePath, { readonly: true });
    try {
        return sqlite.prepare(`
            SELECT id, name, email, password_hash, email_verified, role, avatar_url
            FROM users
            ORDER BY id
        `).all();
    } finally {
        sqlite.close();
    }
}

async function upsertSqliteUser(client, user) {
    const normalizedEmail = normalizeImportEmail(user.email);
    if (!normalizedEmail.includes('@')) {
        return { action: 'skipped', reason: 'invalid_email' };
    }
    const values = [
        user.name,
        normalizedEmail,
        user.password_hash ?? null,
        user.email_verified ?? 0,
        user.role ?? 'user',
        user.avatar_url ?? null,
    ];
    const before = await client.query(
        'SELECT id, password_hash FROM users WHERE lower(trim(email)) = $1 LIMIT 1',
        [normalizedEmail],
    );
    const hashBefore = before.rowCount
        ? String(before.rows[0]?.password_hash || '').trim()
        : '';
    await client.query(UPSERT_USER_BY_EMAIL_SQL, values);
    const after = await client.query(
        'SELECT id, password_hash FROM users WHERE lower(trim(email)) = $1 LIMIT 1',
        [normalizedEmail],
    );
    const hashAfter = String(after.rows[0]?.password_hash || '').trim();
    if (!before.rowCount) {
        return { action: 'inserted' };
    }
    if (!hashBefore && hashAfter) {
        return { action: 'backfilled_password' };
    }
    return { action: 'unchanged' };
}

/**
 * Merge legacy SQLite users into PostgreSQL by email without overwriting password hashes.
 * Safe to run on every deploy (no-op when Postgres already has the accounts).
 */
async function backfillSqliteUsersToPostgres(pool, options = {}) {
    if (!isBackfillEnabled()) {
        return { status: 'skipped', reason: 'disabled' };
    }

    const sqlitePath = options.sqlitePath || resolveSqliteBackfillPath();
    if (!fs.existsSync(sqlitePath)) {
        return { status: 'skipped', reason: 'sqlite_missing', sqlitePath: path.basename(sqlitePath) };
    }

    const allUsers = loadSqliteUsers(sqlitePath);
    const selection = resolveSelectedUsers(allUsers, {
        profile: options.profile || 'production-worthy',
        email: null,
    });
    const selected = selection.selected || [];

    const stats = {
        status: 'ok',
        sqlitePath: path.basename(sqlitePath),
        scanned: selected.length,
        inserted: 0,
        backfilledPassword: 0,
        unchanged: 0,
        skipped: 0,
    };

    if (!selected.length) {
        return stats;
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const user of selected) {
            const result = await upsertSqliteUser(client, user);
            if (result.action === 'inserted') stats.inserted += 1;
            else if (result.action === 'backfilled_password') stats.backfilledPassword += 1;
            else if (result.action === 'unchanged') stats.unchanged += 1;
            else stats.skipped += 1;
        }
        await client.query(`
            SELECT setval(
                pg_get_serial_sequence('users', 'id'),
                COALESCE((SELECT MAX(id) FROM users), 1)
            )
        `);
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }

    return stats;
}

module.exports = {
    UPSERT_USER_BY_EMAIL_SQL,
    backfillSqliteUsersToPostgres,
    resolveSqliteBackfillPath,
    upsertSqliteUser,
    isBackfillEnabled,
};
