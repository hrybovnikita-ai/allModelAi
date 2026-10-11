const { isPostgresConnection } = require('../db/postgresHttpReads');
const { insertAuditEventAsync } = require('../db/postgresHttpProduction');

function nowIso() {
    return new Date().toISOString();
}

async function logPlatformEvent(connection, {
    email,
    featureId,
    action,
    resourceType = null,
    resourceId = null,
    metadata = {},
    ip = null,
}) {
    const payload = {
        featureId,
        ...metadata,
    };
    const row = {
        email: String(email || '').trim().toLowerCase(),
        action: `[${featureId}] ${action}`,
        targetType: resourceType,
        targetId: resourceId,
        metadata: payload,
        ip,
        createdAt: nowIso(),
    };
    if (isPostgresConnection(connection)) {
        await insertAuditEventAsync(connection, row);
        return { logged: true };
    }
    connection.database.prepare(
        `INSERT INTO audit_events (email, action, target_type, target_id, metadata, ip, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
        row.email,
        row.action,
        row.targetType,
        row.targetId,
        JSON.stringify(row.metadata),
        row.ip,
        row.createdAt,
    );
    return { logged: true };
}

module.exports = {
    logPlatformEvent,
};
