/**
 * Auth session persistence. PostgreSQL uses the isolated pgAsyncPool + queryPgPool because
 * the primary pool is shared with PostgresSyncDatabase/deasync and can deadlock or exhaust.
 */
const { queryPgPool, resolvePostgresAsyncPool } = require('./db/pgPoolQuery');

function resolveDb(connection) {
    if (!connection) {
        throw new Error('Database connection is unavailable.');
    }
    return {
        engine: connection.engine || 'sqlite',
        database: connection.database,
    };
}

async function insertAuthSession(connection, tokenHash, userId, expiresAt) {
    const { engine, database } = resolveDb(connection);
    const asyncPool = resolvePostgresAsyncPool(connection);
    if (engine === 'postgres' && asyncPool) {
        await queryPgPool(
            asyncPool,
            'INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
            [tokenHash, userId, expiresAt],
        );
        return;
    }
    database.prepare(
        'INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
    ).run(tokenHash, userId, expiresAt);
}

async function syncLoginUserName(connection, account, safeName, usersCache) {
    if (!safeName || account.name === safeName) {
        return account;
    }
    account.name = safeName;
    const { engine, database } = resolveDb(connection);
    const asyncPool = resolvePostgresAsyncPool(connection);
    if (engine === 'postgres' && asyncPool) {
        await queryPgPool(
            asyncPool,
            'UPDATE users SET name = $1 WHERE id = $2',
            [account.name, account.id],
        );
    } else {
        database.prepare('UPDATE users SET name = ? WHERE id = ?').run(account.name, account.id);
    }
    const cached = usersCache.find((item) => item.id === account.id);
    if (cached) {
        cached.name = account.name;
    }
    return account;
}

async function deleteAuthSessionByToken(connection, tokenHash) {
    const asyncPool = resolvePostgresAsyncPool(connection);
    if (asyncPool) {
        await queryPgPool(
            asyncPool,
            'DELETE FROM auth_sessions WHERE token_hash = $1',
            [tokenHash],
        );
        return;
    }
    connection.database.prepare(
        'DELETE FROM auth_sessions WHERE token_hash = ?',
    ).run(tokenHash);
}

function safeSessionErrorCode(error) {
    const code = String(error?.code || '');
    if (code === '23505') return 'SESSION_DUPLICATE';
    if (code === '23503') return 'SESSION_USER_FK';
    if (code === '57014') return 'SESSION_DB_TIMEOUT';
    if (code.startsWith('23')) return 'SESSION_DB_CONSTRAINT';
    return 'SESSION_DB_ERROR';
}

module.exports = {
    insertAuthSession,
    syncLoginUserName,
    deleteAuthSessionByToken,
    safeSessionErrorCode,
};
