function trustedOwnerFirebaseUids() {
    return new Set(
        String(process.env.OWNER_FIREBASE_UIDS || '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
    );
}

function isTrustedOwnerFirebaseUid(uid) {
    const normalized = String(uid || '').trim();
    if (!normalized) return false;
    return trustedOwnerFirebaseUids().has(normalized);
}

/** Server-only: promote configured Firebase UID to users.role = owner (never from client body). */
function promoteTrustedOwnerRoleSync(database, userId, firebaseUid) {
    if (!database || !userId || !isTrustedOwnerFirebaseUid(firebaseUid)) return false;
    const result = database.prepare(
        "UPDATE users SET role = 'owner' WHERE id = ? AND lower(coalesce(role, 'user')) NOT IN ('owner')",
    ).run(userId);
    return result.changes > 0;
}

async function promoteTrustedOwnerRoleAsync(connection, userId, firebaseUid) {
    if (!connection || !userId || !isTrustedOwnerFirebaseUid(firebaseUid)) return false;
    const engine = connection.engine || 'sqlite';
    if (engine === 'postgres') {
        const { queryPgPool, resolvePostgresAsyncPool } = require('../db/pgPoolQuery');
        const result = await queryPgPool(
            resolvePostgresAsyncPool(connection),
            "UPDATE users SET role = 'owner' WHERE id = $1 AND lower(coalesce(role, 'user')) NOT IN ('owner')",
            [userId],
        );
        return (result.rowCount || 0) > 0;
    }
    return promoteTrustedOwnerRoleSync(connection.database, userId, firebaseUid);
}

module.exports = {
    isTrustedOwnerFirebaseUid,
    promoteTrustedOwnerRoleAsync,
    promoteTrustedOwnerRoleSync,
    trustedOwnerFirebaseUids,
};
