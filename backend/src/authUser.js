/**
 * Email/password auth reads users only from the active database (never from src/data/data.js).
 */
function loadAuthUserByEmail(database, normalizedEmail) {
    if (!database || !normalizedEmail) return null;
    return database.prepare(`
        SELECT
            id,
            name,
            email,
            password_hash AS passwordHash,
            avatar_url AS avatar
        FROM users
        WHERE lower(trim(email)) = ?
    `).get(normalizedEmail) || null;
}

module.exports = {
    loadAuthUserByEmail,
};
