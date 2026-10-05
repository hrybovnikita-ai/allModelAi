const { queryPgPool, resolvePostgresAsyncPool } = require('../db/pgPoolQuery');

async function readUserRoleAsync(connection, email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) return 'user';
    const engine = connection?.engine || 'sqlite';
    if (engine === 'postgres') {
        const pool = resolvePostgresAsyncPool(connection);
        const result = await queryPgPool(
            pool,
            'SELECT role FROM users WHERE lower(trim(email)) = $1 LIMIT 1',
            [normalizedEmail],
        );
        return String(result.rows[0]?.role || 'user').trim().toLowerCase() || 'user';
    }
    const row = connection.database.prepare(
        'SELECT role FROM users WHERE lower(trim(email)) = ? LIMIT 1',
    ).get(normalizedEmail);
    return String(row?.role || 'user').trim().toLowerCase() || 'user';
}

function readUserRoleSync(connection, email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) return 'user';
    const row = connection.database.prepare(
        'SELECT role FROM users WHERE lower(trim(email)) = ? LIMIT 1',
    ).get(normalizedEmail);
    return String(row?.role || 'user').trim().toLowerCase() || 'user';
}

module.exports = {
    readUserRoleAsync,
    readUserRoleSync,
};
