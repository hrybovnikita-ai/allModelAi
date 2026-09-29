const { mapAuthUserRow } = require('./authPasswordHash');

/**
 * Email/password auth reads users only from the active database (never from src/data/data.js).
 */
function loadAuthUserByEmail(database, normalizedEmail) {
    if (!database || !normalizedEmail) return null;
    const row = database.prepare(`
        SELECT
            id,
            name,
            email,
            password_hash,
            avatar_url
        FROM users
        WHERE lower(trim(email)) = ?
    `).get(normalizedEmail);
    return mapAuthUserRow(row);
}

module.exports = {
    loadAuthUserByEmail,
};
