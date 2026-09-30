const crypto = require('node:crypto');
const { queryPgPool, resolvePostgresAsyncPool } = require('./pgPoolQuery');

async function pingPostgresAsync(connection) {
    const pool = resolvePostgresAsyncPool(connection);
    await queryPgPool(pool, 'SELECT 1 AS ok');
    return true;
}

async function countActiveSessionsAsync(connection, nowMs) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        'SELECT COUNT(*)::int AS count FROM auth_sessions WHERE expires_at > $1',
        [nowMs],
    );
    return Number(result.rows[0]?.count ?? 0);
}

async function insertAuditEventAsync(connection, row) {
    const pool = resolvePostgresAsyncPool(connection);
    await queryPgPool(
        pool,
        `INSERT INTO audit_events (email, action, target_type, target_id, metadata, ip, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [row.email, row.action, row.targetType, row.targetId, JSON.stringify(row.metadata || {}), row.ip, row.createdAt],
    );
}

async function globalSearchAsync(connection, email, query) {
    const pool = resolvePostgresAsyncPool(connection);
    const pattern = `%${query.replace(/[%_]/g, '')}%`;
    const conversations = await queryPgPool(
        pool,
        `SELECT id, title AS name, model, updated_at AS "updatedAt"
         FROM conversations
         WHERE email = $1 AND (title ILIKE $2 OR messages ILIKE $2)
         ORDER BY updated_at DESC LIMIT 20`,
        [email, pattern],
    );
    const workspace = await queryPgPool(
        pool,
        `SELECT id, type, data, updated_at AS "updatedAt"
         FROM workspace_items
         WHERE email = $1 AND data ILIKE $2
         ORDER BY updated_at DESC LIMIT 30`,
        [email, pattern],
    );
    return { conversations: conversations.rows, workspace: workspace.rows };
}

async function listBackgroundJobsAsync(connection, email) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        'SELECT * FROM background_jobs WHERE email = $1 ORDER BY created_at DESC LIMIT 100',
        [email],
    );
    return result.rows;
}

async function getBackgroundJobAsync(connection, id) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(pool, 'SELECT * FROM background_jobs WHERE id = $1', [id]);
    return result.rows[0] || null;
}

async function insertBackgroundJobAsync(connection, row) {
    const pool = resolvePostgresAsyncPool(connection);
    await queryPgPool(
        pool,
        `INSERT INTO background_jobs (id, email, type, status, progress, stage, payload, created_at, updated_at)
         VALUES ($1, $2, $3, 'queued', 0, 'Queued', $4, $5, $6)`,
        [row.id, row.email, row.type, JSON.stringify(row.payload || {}), row.createdAt, row.createdAt],
    );
}

async function updateBackgroundJobAsync(connection, id, patch) {
    const pool = resolvePostgresAsyncPool(connection);
    const fields = [];
    const values = [];
    let index = 1;
    for (const [key, column] of Object.entries({
        status: 'status',
        progress: 'progress',
        stage: 'stage',
        result: 'result',
        error: 'error',
        updatedAt: 'updated_at',
    })) {
        if (patch[key] !== undefined) {
            fields.push(`${column} = $${index}`);
            values.push(patch[key]);
            index += 1;
        }
    }
    if (!fields.length) return 0;
    values.push(id);
    const result = await queryPgPool(
        pool,
        `UPDATE background_jobs SET ${fields.join(', ')} WHERE id = $${index}`,
        values,
    );
    return result.rowCount ?? 0;
}

async function cancelBackgroundJobAsync(connection, id, email, updatedAt) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        `UPDATE background_jobs SET status = 'canceled', stage = 'Canceled', updated_at = $1
         WHERE id = $2 AND email = $3 AND status IN ('queued', 'running')`,
        [updatedAt, id, email],
    );
    return result.rowCount ?? 0;
}

async function insertNotificationAsync(connection, row) {
    const pool = resolvePostgresAsyncPool(connection);
    await queryPgPool(
        pool,
        `INSERT INTO notifications (id, email, title, message, kind, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [row.id, row.email, row.title, row.message, row.kind, row.createdAt],
    );
}

async function listNotificationsAsync(connection, email) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        `SELECT id, title, message, kind, read_at AS "readAt", created_at AS "createdAt"
         FROM notifications WHERE email = $1 ORDER BY created_at DESC LIMIT 100`,
        [email],
    );
    return result.rows;
}

async function markNotificationReadAsync(connection, id, email, readAt) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        'UPDATE notifications SET read_at = $1 WHERE id = $2 AND email = $3',
        [readAt, id, email],
    );
    return result.rowCount ?? 0;
}

async function listUsageEventsAsync(connection, email) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        `SELECT model, input_tokens AS "inputTokens", output_tokens AS "outputTokens",
                latency_ms AS "latencyMs", fallback_used AS "fallbackUsed",
                estimated_cost AS "estimatedCost", created_at AS "createdAt"
         FROM usage_events WHERE email = $1 ORDER BY created_at DESC LIMIT 500`,
        [email],
    );
    return result.rows;
}

async function listAuditEventsAsync(connection, email) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        `SELECT id, action, target_type AS "targetType", target_id AS "targetId",
                metadata, ip, created_at AS "createdAt"
         FROM audit_events WHERE email = $1 ORDER BY created_at DESC LIMIT 200`,
        [email],
    );
    return result.rows;
}

async function listWebhooksAsync(connection, email) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        `SELECT id, name, url, active, created_at AS "createdAt"
         FROM webhooks WHERE email = $1 ORDER BY created_at DESC`,
        [email],
    );
    return result.rows;
}

async function insertWebhookAsync(connection, row) {
    const pool = resolvePostgresAsyncPool(connection);
    await queryPgPool(
        pool,
        `INSERT INTO webhooks (id, email, name, url, secret_hash, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [row.id, row.email, row.name, row.url, row.secretHash, row.createdAt],
    );
}

async function deleteWebhookAsync(connection, id, email) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        'DELETE FROM webhooks WHERE id = $1 AND email = $2',
        [id, email],
    );
    return result.rowCount ?? 0;
}

async function privacyExportAsync(connection, email) {
    const pool = resolvePostgresAsyncPool(connection);
    const user = await queryPgPool(
        pool,
        `SELECT id, name, email, email_verified AS "emailVerified", role
         FROM users WHERE lower(email) = lower($1)`,
        [email],
    );
    const conversations = await queryPgPool(
        pool,
        `SELECT id, model, title, messages, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM conversations WHERE email = $1`,
        [email],
    );
    const workspace = await queryPgPool(
        pool,
        `SELECT id, type, data, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM workspace_items WHERE email = $1`,
        [email],
    );
    return {
        user: user.rows[0],
        conversations: conversations.rows,
        workspace: workspace.rows,
    };
}

async function insertAccountTokenAsync(connection, row) {
    const pool = resolvePostgresAsyncPool(connection);
    await queryPgPool(
        pool,
        `INSERT INTO account_tokens (token_hash, email, purpose, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [row.tokenHash, row.email, row.purpose, row.expiresAt, row.createdAt],
    );
}

async function findAccountTokenAsync(connection, tokenHash, purpose, nowMs) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        'SELECT * FROM account_tokens WHERE token_hash = $1 AND purpose = $2 AND expires_at > $3',
        [tokenHash, purpose, nowMs],
    );
    return result.rows[0] || null;
}

async function deleteAccountTokenAsync(connection, tokenHash) {
    const pool = resolvePostgresAsyncPool(connection);
    await queryPgPool(pool, 'DELETE FROM account_tokens WHERE token_hash = $1', [tokenHash]);
}

async function findUserByEmailInsensitiveAsync(connection, email) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        'SELECT id, email FROM users WHERE lower(email) = lower($1)',
        [email],
    );
    return result.rows[0] || null;
}

async function updateUserPasswordAsync(connection, email, passwordHash) {
    const pool = resolvePostgresAsyncPool(connection);
    await queryPgPool(
        pool,
        'UPDATE users SET password_hash = $1 WHERE lower(email) = lower($2)',
        [passwordHash, email],
    );
    await queryPgPool(
        pool,
        `DELETE FROM auth_sessions
         WHERE user_id IN (SELECT id FROM users WHERE lower(email) = lower($1))`,
        [email],
    );
}

async function verifyUserEmailAsync(connection, email) {
    const pool = resolvePostgresAsyncPool(connection);
    await queryPgPool(
        pool,
        'UPDATE users SET email_verified = 1 WHERE lower(email) = lower($1)',
        [email],
    );
}

async function listWebhooksForEmailAsync(connection, email) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        'SELECT id, url, secret_hash FROM webhooks WHERE email = $1',
        [email],
    );
    return result.rows;
}

async function updateSubscriptionCanceledByStripeIdAsync(connection, stripeSubscriptionId, updatedAt) {
    const pool = resolvePostgresAsyncPool(connection);
    await queryPgPool(
        pool,
        `UPDATE subscription_details SET status = 'canceled', updated_at = $1
         WHERE stripe_subscription_id = $2`,
        [updatedAt, stripeSubscriptionId],
    );
}

async function findActiveSubscriptionEmailByStripeIdAsync(connection, stripeSubscriptionId) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        `SELECT email FROM subscription_details
         WHERE stripe_subscription_id = $1 AND status = 'active'`,
        [stripeSubscriptionId],
    );
    return result.rows[0]?.email || null;
}

function hashValue(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

module.exports = {
    pingPostgresAsync,
    countActiveSessionsAsync,
    insertAuditEventAsync,
    globalSearchAsync,
    listBackgroundJobsAsync,
    getBackgroundJobAsync,
    insertBackgroundJobAsync,
    updateBackgroundJobAsync,
    cancelBackgroundJobAsync,
    insertNotificationAsync,
    listNotificationsAsync,
    markNotificationReadAsync,
    listUsageEventsAsync,
    listAuditEventsAsync,
    listWebhooksAsync,
    insertWebhookAsync,
    deleteWebhookAsync,
    privacyExportAsync,
    insertAccountTokenAsync,
    findAccountTokenAsync,
    deleteAccountTokenAsync,
    findUserByEmailInsensitiveAsync,
    updateUserPasswordAsync,
    verifyUserEmailAsync,
    listWebhooksForEmailAsync,
    updateSubscriptionCanceledByStripeIdAsync,
    findActiveSubscriptionEmailByStripeIdAsync,
    hashValue,
};
