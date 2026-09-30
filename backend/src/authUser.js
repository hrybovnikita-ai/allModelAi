const { mapAuthUserRow } = require('./authPasswordHash');

const AUTH_USER_BY_EMAIL_SQLITE = `
        SELECT
            id,
            name,
            email,
            password_hash,
            avatar_url
        FROM users
        WHERE lower(trim(email)) = ?`;

const AUTH_USER_BY_EMAIL_PG = `
        SELECT
            id,
            name,
            email,
            password_hash,
            avatar_url
        FROM users
        WHERE lower(trim(email)) = $1`;

function resolveDbConnection(connection) {
    if (!connection) {
        throw new Error('Database connection is unavailable.');
    }
    return {
        engine: connection.engine || 'sqlite',
        database: connection.database,
    };
}

/**
 * Email/password auth reads users only from the active database (never from src/data/data.js).
 */
function loadAuthUserByEmail(database, normalizedEmail) {
    if (!database || !normalizedEmail) return null;
    const row = database.prepare(AUTH_USER_BY_EMAIL_SQLITE).get(normalizedEmail);
    return mapAuthUserRow(row);
}

/**
 * Login path user lookup. PostgreSQL uses async pool.query so deasync does not block
 * the event loop after awaited password verification on subsequent requests.
 */
async function loadAuthUserByEmailAsync(connection, normalizedEmail) {
    if (!connection || !normalizedEmail) return null;
    const { engine, database } = resolveDbConnection(connection);
    if (engine === 'postgres' && database?.pool) {
        const result = await database.pool.query(AUTH_USER_BY_EMAIL_PG, [normalizedEmail]);
        return mapAuthUserRow(result.rows[0]);
    }
    return loadAuthUserByEmail(database, normalizedEmail);
}

module.exports = {
    loadAuthUserByEmail,
    loadAuthUserByEmailAsync,
};
