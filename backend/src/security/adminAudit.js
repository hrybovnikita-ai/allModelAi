const { isPostgresConnection } = require('../db/postgresHttpReads');
const { queryPgPool, resolvePostgresAsyncPool } = require('../db/pgPoolQuery');
const { redactObject } = require('./redact');
const { ensureAdminAuditSchema } = require('./adminAuditSchema');
const { securityLog } = require('./structuredLog');

const FORBIDDEN_META_KEYS = new Set([
    'message',
    'messages',
    'content',
    'prompt',
    'text',
    'body',
    'password',
    'token',
]);

function sanitizeAdminMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object') return {};
    const cleaned = {};
    for (const [key, value] of Object.entries(metadata)) {
        if (FORBIDDEN_META_KEYS.has(String(key).toLowerCase())) continue;
        cleaned[key] = value;
    }
    return redactObject(cleaned);
}

function nowIso() {
    return new Date().toISOString();
}

/**
 * Persist an admin audit event without private message content.
 */
async function logAdminAudit(connection, {
    actor = 'admin',
    action,
    targetType = null,
    targetId = null,
    metadata = {},
    ip = null,
    correlationId = null,
}) {
    if (!action) return { logged: false };
    const safeMeta = sanitizeAdminMetadata(metadata);
    const row = {
        actor: String(actor || 'admin').slice(0, 120),
        action: String(action).slice(0, 200),
        targetType: targetType == null ? null : String(targetType).slice(0, 120),
        targetId: targetId == null ? null : String(targetId).slice(0, 200),
        metadata: safeMeta,
        ip: ip == null ? null : String(ip).slice(0, 80),
        correlationId: correlationId == null ? null : String(correlationId).slice(0, 80),
        createdAt: nowIso(),
    };

    securityLog('admin_audit', {
        actor: row.actor,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        ip: row.ip,
        correlationId: row.correlationId,
    });

    if (!connection) return { logged: false, reason: 'no_connection' };

    try {
        if (isPostgresConnection(connection)) {
            const pool = resolvePostgresAsyncPool(connection);
            if (pool) {
                await queryPgPool(
                    pool,
                    `INSERT INTO admin_audit_logs
                     (actor, action, target_type, target_id, metadata, ip, correlation_id, created_at)
                     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)`,
                    [
                        row.actor,
                        row.action,
                        row.targetType,
                        row.targetId,
                        JSON.stringify(row.metadata),
                        row.ip,
                        row.correlationId,
                        row.createdAt,
                    ],
                );
                return { logged: true };
            }
        }
        if (connection.database) {
            ensureAdminAuditSchema(connection.database);
            connection.database.prepare(
                `INSERT INTO admin_audit_logs
                 (actor, action, target_type, target_id, metadata, ip, correlation_id, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            ).run(
                row.actor,
                row.action,
                row.targetType,
                row.targetId,
                JSON.stringify(row.metadata),
                row.ip,
                row.correlationId,
                row.createdAt,
            );
            return { logged: true };
        }
    } catch (error) {
        securityLog('admin_audit_failed', { reason: error?.message || 'write_failed' });
        return { logged: false, reason: 'write_failed' };
    }
    return { logged: false };
}

/**
 * Express middleware wrapper: after requireAdmin succeeds, log the action.
 */
function adminAuditMiddleware(actionResolver) {
    return async (req, res, next) => {
        const resolve = typeof actionResolver === 'function'
            ? actionResolver
            : () => ({ action: String(actionResolver || req.path) });
        try {
            const details = resolve(req) || {};
            await logAdminAudit(req.app?.locals?.db, {
                actor: req.get('x-admin-actor') || 'admin-key',
                action: details.action || `${req.method} ${req.path}`,
                targetType: details.targetType || null,
                targetId: details.targetId || null,
                metadata: {
                    method: req.method,
                    path: req.path,
                    ...(details.metadata || {}),
                },
                ip: req.ip,
                correlationId: req.correlationId,
            });
        } catch {
            /* never block admin on audit failure */
        }
        return next();
    };
}

module.exports = {
    logAdminAudit,
    adminAuditMiddleware,
    sanitizeAdminMetadata,
};
