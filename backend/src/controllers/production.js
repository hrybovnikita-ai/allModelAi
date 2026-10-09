const crypto = require('node:crypto');
const users = require('../data/data');
const { hashPassword } = require('../password');
const json = (value, fallback = {}) => { try { return JSON.parse(value); } catch { return fallback; } };
const now = () => new Date().toISOString();
const { databaseFingerprint } = require('../runtimeDiagnostics');
const { getDatabaseEngine } = require('../db/provider');
const { isPostgresConnection } = require('../db/postgresHttpReads');
const {
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
    hashValue,
} = require('../db/postgresHttpProduction');
const { runPyTorchTrainJob } = require('../services/aiPythonJobRunner');

async function audit(req, action, targetType, targetId, metadata = {}) {
    const connection = req.app.locals.db;
    if (isPostgresConnection(connection)) {
        await insertAuditEventAsync(connection, {
            email: req.user.email,
            action,
            targetType,
            targetId,
            metadata,
            ip: req.ip || null,
            createdAt: now(),
        });
        return;
    }
    connection.database.prepare('INSERT INTO audit_events (email, action, target_type, target_id, metadata, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(req.user.email, action, targetType || null, targetId || null, JSON.stringify(metadata), req.ip || null, now());
}

const health = async (req, res) => {
    const connection = req.app.locals.db;
    const engine = connection.engine || getDatabaseEngine();
    const { isOpenRouterConfigured } = require('../openRouterConfig');
    const checks = { database: false, openai: Boolean(process.env.OPENAI_API_KEY || process.env.OPEN_AI_API_KEY), openrouter: isOpenRouterConfigured(), email: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM), payments: Boolean(process.env.STRIPE_SECRET_KEY) || Boolean(process.env.WAYFORPAY_SECRET_KEY?.trim() && process.env.WAYFORPAY_MERCHANT_ACCOUNT?.trim()), monitoring: Boolean(process.env.SENTRY_DSN) };
    try {
        if (isPostgresConnection(connection)) {
            await pingPostgresAsync(connection);
        } else {
            connection.database.prepare('SELECT 1').get();
        }
        checks.database = true;
    } catch { /* reported below */ }
    const ready = checks.database;
    let imageGeneration = null;
    try {
        const { imageGenerationHealth } = require('../imageConfig');
        imageGeneration = imageGenerationHealth();
    } catch {
        imageGeneration = { configured: false, code: 'IMAGE_HEALTH_UNAVAILABLE' };
    }
    return res.status(ready ? 200 : 503).json({
        status: ready ? 'healthy' : 'degraded',
        service: 'AllModelAI',
        database: {
            engine,
            connected: checks.database,
            fingerprint: checks.database && !isPostgresConnection(connection) ? databaseFingerprint(connection.database) : null,
        },
        version: process.env.APP_VERSION || '1.0.0',
        uptimeSeconds: Math.floor(process.uptime()),
        checks,
        imageGeneration,
        timestamp: now(),
    });
};

const jobPayload = (row) => ({
    id: row.id,
    type: row.type,
    status: row.status,
    progress: row.progress,
    stage: row.stage,
    payload: json(row.payload),
    result: json(row.result, null),
    error: row.error,
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt,
});

const processJob = (app, id) => {
    const connection = app.locals.db;
    if (isPostgresConnection(connection)) {
        if (process.env.NODE_ENV !== 'test') {
            setImmediate(() => runPyTorchTrainJob(app, id));
        }
        return;
    }
    const db = connection.database;
    const row = db.prepare('SELECT * FROM background_jobs WHERE id = ?').get(id);
    if (!row || row.status !== 'queued') return;
    if (row.type === 'pytorch-train') {
        if (process.env.NODE_ENV !== 'test') setImmediate(() => runPyTorchTrainJob(app, id));
        return;
    }
    db.prepare("UPDATE background_jobs SET status='running', progress=15, stage='Planning', updated_at=? WHERE id=?").run(now(), id);
    const stages = [['Collecting inputs', 35], ['Processing', 65], ['Verifying result', 90]];
    let index = 0;
    const advance = () => {
        const current = db.prepare('SELECT status FROM background_jobs WHERE id=?').get(id);
        if (!current || current.status === 'canceled') return;
        if (index < stages.length) {
            const [stage, progress] = stages[index++];
            db.prepare('UPDATE background_jobs SET stage=?, progress=?, updated_at=? WHERE id=?').run(stage, progress, now(), id);
            return setTimeout(advance, 60);
        }
        const payload = json(row.payload);
        const result = { completed: true, message: `${row.type} job completed`, input: payload, completedAt: now() };
        db.transaction(() => {
            db.prepare("UPDATE background_jobs SET status='completed', progress=100, stage='Complete', result=?, updated_at=? WHERE id=?").run(JSON.stringify(result), now(), id);
            db.prepare('INSERT INTO notifications (id,email,title,message,kind,created_at) VALUES (?,?,?,?,?,?)').run(`notification-${crypto.randomUUID()}`, row.email, 'Background task finished', `${row.type} is ready to review.`, 'job', now());
        })();
    };
    setTimeout(advance, 60);
};

const globalSearch = async (req, res) => {
    const query = String(req.query.q || '').trim().slice(0, 200);
    if (query.length < 2) return res.json({ query, results: [] });
    const connection = req.app.locals.db;
    if (isPostgresConnection(connection)) {
        const { conversations, workspace } = await globalSearchAsync(connection, req.user.email, query);
        const convResults = conversations.map((item) => ({
            ...item,
            type: 'conversation',
            excerpt: `Chat with ${item.model || 'AI'}`,
        }));
        const workspaceResults = workspace.map((row) => {
            const data = json(row.data);
            return {
                id: row.id,
                type: row.type,
                name: data.name || row.type,
                excerpt: String(data.content || data.instructions || data.prompt || '').slice(0, 220),
                updatedAt: row.updatedAt,
            };
        });
        return res.json({
            query,
            results: [...convResults, ...workspaceResults].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 40),
        });
    }
    const pattern = `%${query.replace(/[%_]/g, '')}%`;
    const db = connection.database;
    const conversations = db.prepare('SELECT id, title AS name, model, updated_at AS updatedAt FROM conversations WHERE email = ? AND (title LIKE ? OR messages LIKE ?) ORDER BY updated_at DESC LIMIT 20').all(req.user.email, pattern, pattern).map((item) => ({ ...item, type: 'conversation', excerpt: `Chat with ${item.model || 'AI'}` }));
    const workspace = db.prepare('SELECT id, type, data, updated_at AS updatedAt FROM workspace_items WHERE email = ? AND data LIKE ? ORDER BY updated_at DESC LIMIT 30').all(req.user.email, pattern).map((row) => {
        const data = json(row.data);
        return { id: row.id, type: row.type, name: data.name || row.type, excerpt: String(data.content || data.instructions || data.prompt || '').slice(0, 220), updatedAt: row.updatedAt };
    });
    return res.json({ query, results: [...conversations, ...workspace].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 40) });
};

const listJobs = async (req, res) => {
    const connection = req.app.locals.db;
    if (isPostgresConnection(connection)) {
        const rows = await listBackgroundJobsAsync(connection, req.user.email);
        return res.json(rows.map(jobPayload));
    }
    return res.json(connection.database.prepare('SELECT * FROM background_jobs WHERE email=? ORDER BY created_at DESC LIMIT 100').all(req.user.email).map(jobPayload));
};

const createJob = async (req, res) => {
    const type = String(req.body.type || '').trim().slice(0, 50);
    if (!['research', 'evaluation', 'meeting', 'workflow', 'document', 'pytorch-train'].includes(type)) {
        return res.status(400).json({ message: 'Unsupported job type' });
    }
    const id = `job-${crypto.randomUUID()}`;
    const createdAt = now();
    const connection = req.app.locals.db;
    if (isPostgresConnection(connection)) {
        await insertBackgroundJobAsync(connection, {
            id,
            email: req.user.email,
            type,
            payload: req.body.payload || {},
            createdAt,
        });
        await audit(req, 'job.created', 'job', id, { type });
        if (process.env.NODE_ENV !== 'test') setImmediate(() => processJob(req.app, id));
        const row = await getBackgroundJobAsync(connection, id);
        return res.status(202).json(jobPayload(row));
    }
    connection.database.prepare("INSERT INTO background_jobs (id,email,type,status,progress,stage,payload,created_at,updated_at) VALUES (?,?,?,'queued',0,'Queued',?,?,?)").run(id, req.user.email, type, JSON.stringify(req.body.payload || {}), createdAt, createdAt);
    await audit(req, 'job.created', 'job', id, { type });
    if (process.env.NODE_ENV !== 'test') setImmediate(() => processJob(req.app, id));
    return res.status(202).json(jobPayload(connection.database.prepare('SELECT * FROM background_jobs WHERE id=?').get(id)));
};

const cancelJob = async (req, res) => {
    const connection = req.app.locals.db;
    if (isPostgresConnection(connection)) {
        const changes = await cancelBackgroundJobAsync(connection, req.params.id, req.user.email, now());
        if (changes) await audit(req, 'job.canceled', 'job', req.params.id);
        return changes ? res.json({ message: 'Job canceled' }) : res.status(404).json({ message: 'Cancelable job not found' });
    }
    const result = connection.database.prepare("UPDATE background_jobs SET status='canceled', stage='Canceled', updated_at=? WHERE id=? AND email=? AND status IN ('queued','running')").run(now(), req.params.id, req.user.email);
    if (result.changes) await audit(req, 'job.canceled', 'job', req.params.id);
    return result.changes ? res.json({ message: 'Job canceled' }) : res.status(404).json({ message: 'Cancelable job not found' });
};

const listNotifications = async (req, res) => {
    const connection = req.app.locals.db;
    if (isPostgresConnection(connection)) {
        return res.json(await listNotificationsAsync(connection, req.user.email));
    }
    return res.json(connection.database.prepare('SELECT id,title,message,kind,read_at AS readAt,created_at AS createdAt FROM notifications WHERE email=? ORDER BY created_at DESC LIMIT 100').all(req.user.email));
};

const readNotification = async (req, res) => {
    const connection = req.app.locals.db;
    if (isPostgresConnection(connection)) {
        const changes = await markNotificationReadAsync(connection, req.params.id, req.user.email, now());
        return changes ? res.json({ message: 'Notification read' }) : res.status(404).json({ message: 'Notification not found' });
    }
    const result = connection.database.prepare('UPDATE notifications SET read_at=? WHERE id=? AND email=?').run(now(), req.params.id, req.user.email);
    return result.changes ? res.json({ message: 'Notification read' }) : res.status(404).json({ message: 'Notification not found' });
};

const usageReport = async (req, res) => {
    const connection = req.app.locals.db;
    const rows = isPostgresConnection(connection)
        ? await listUsageEventsAsync(connection, req.user.email)
        : connection.database.prepare('SELECT model, input_tokens AS inputTokens, output_tokens AS outputTokens, latency_ms AS latencyMs, fallback_used AS fallbackUsed, estimated_cost AS estimatedCost, created_at AS createdAt FROM usage_events WHERE email=? ORDER BY created_at DESC LIMIT 500').all(req.user.email);
    const totals = rows.reduce((sum, row) => ({
        requests: sum.requests + 1,
        inputTokens: sum.inputTokens + Number(row.inputTokens ?? row.inputtokens ?? 0),
        outputTokens: sum.outputTokens + Number(row.outputTokens ?? row.outputtokens ?? 0),
        estimatedCost: sum.estimatedCost + Number(row.estimatedCost ?? row.estimatedcost ?? 0),
        fallbacks: sum.fallbacks + Number(row.fallbackUsed ?? row.fallbackused ?? 0),
    }), { requests: 0, inputTokens: 0, outputTokens: 0, estimatedCost: 0, fallbacks: 0 });
    return res.json({ totals: { ...totals, estimatedCost: Number(totals.estimatedCost.toFixed(6)) }, events: rows });
};

const auditLog = async (req, res) => {
    const connection = req.app.locals.db;
    const rows = isPostgresConnection(connection)
        ? await listAuditEventsAsync(connection, req.user.email)
        : connection.database.prepare('SELECT id,action,target_type AS targetType,target_id AS targetId,metadata,ip,created_at AS createdAt FROM audit_events WHERE email=? ORDER BY created_at DESC LIMIT 200').all(req.user.email);
    return res.json(rows.map((row) => ({ ...row, metadata: json(row.metadata) })));
};

const listWebhooks = async (req, res) => res.json(isPostgresConnection(req.app.locals.db)
    ? await listWebhooksAsync(req.app.locals.db, req.user.email)
    : req.app.locals.db.database.prepare('SELECT id,name,url,active,created_at AS createdAt FROM webhooks WHERE email=? ORDER BY created_at DESC').all(req.user.email));

const createWebhook = async (req, res) => {
    const name = String(req.body.name || '').trim().slice(0, 80);
    const url = String(req.body.url || '').trim();
    let parsed;
    try { parsed = new URL(url); } catch { return res.status(400).json({ message: 'Valid HTTPS webhook URL required' }); }
    if (parsed.protocol !== 'https:' && process.env.NODE_ENV === 'production') return res.status(400).json({ message: 'Production webhooks must use HTTPS' });
    const secret = `whsec_${crypto.randomBytes(24).toString('base64url')}`;
    const id = `webhook-${crypto.randomUUID()}`;
    const createdAt = now();
    const connection = req.app.locals.db;
    if (isPostgresConnection(connection)) {
        await insertWebhookAsync(connection, {
            id,
            email: req.user.email,
            name: name || parsed.hostname,
            url,
            secretHash: hashValue(secret),
            createdAt,
        });
    } else {
        connection.database.prepare('INSERT INTO webhooks (id,email,name,url,secret_hash,created_at) VALUES (?,?,?,?,?,?)').run(id, req.user.email, name || parsed.hostname, url, hashValue(secret), createdAt);
    }
    await audit(req, 'webhook.created', 'webhook', id);
    return res.status(201).json({ id, name: name || parsed.hostname, url, active: 1, createdAt, secret, warning: 'Copy the signing secret now.' });
};

const deleteWebhook = async (req, res) => {
    const connection = req.app.locals.db;
    if (isPostgresConnection(connection)) {
        const changes = await deleteWebhookAsync(connection, req.params.id, req.user.email);
        if (changes) await audit(req, 'webhook.deleted', 'webhook', req.params.id);
        return changes ? res.json({ message: 'Webhook deleted' }) : res.status(404).json({ message: 'Webhook not found' });
    }
    const result = connection.database.prepare('DELETE FROM webhooks WHERE id=? AND email=?').run(req.params.id, req.user.email);
    if (result.changes) await audit(req, 'webhook.deleted', 'webhook', req.params.id);
    return result.changes ? res.json({ message: 'Webhook deleted' }) : res.status(404).json({ message: 'Webhook not found' });
};

const privacyExport = async (req, res) => {
    const connection = req.app.locals.db;
    const email = req.user.email;
    if (isPostgresConnection(connection)) {
        const exported = await privacyExportAsync(connection, email);
        await audit(req, 'privacy.exported', 'account', String(exported.user.id));
        res.setHeader('Content-Disposition', `attachment; filename="allmodelai-export-${Date.now()}.json"`);
        return res.json({
            exportedAt: now(),
            user: exported.user,
            conversations: exported.conversations.map((row) => ({ ...row, messages: json(row.messages, []) })),
            workspace: exported.workspace.map((row) => ({ ...row, ...json(row.data), data: undefined })),
        });
    }
    const db = connection.database;
    const user = db.prepare('SELECT id,name,email,email_verified AS emailVerified,role FROM users WHERE lower(email)=lower(?)').get(email);
    const conversations = db.prepare('SELECT id,model,title,messages,created_at AS createdAt,updated_at AS updatedAt FROM conversations WHERE email=?').all(email).map((row) => ({ ...row, messages: json(row.messages, []) }));
    const workspace = db.prepare('SELECT id,type,data,created_at AS createdAt,updated_at AS updatedAt FROM workspace_items WHERE email=?').all(email).map((row) => ({ ...row, ...json(row.data), data: undefined }));
    await audit(req, 'privacy.exported', 'account', String(user.id));
    res.setHeader('Content-Disposition', `attachment; filename="allmodelai-export-${Date.now()}.json"`);
    return res.json({ exportedAt: now(), user, conversations, workspace });
};

const createAccountToken = async (req, res, purpose) => {
    const secret = crypto.randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + 30 * 60 * 1000;
    const connection = req.app.locals.db;
    if (isPostgresConnection(connection)) {
        await insertAccountTokenAsync(connection, {
            tokenHash: hashValue(secret),
            email: req.user.email,
            purpose,
            expiresAt,
            createdAt: now(),
        });
    } else {
        connection.database.prepare('INSERT INTO account_tokens (token_hash,email,purpose,expires_at,created_at) VALUES (?,?,?,?,?)').run(hashValue(secret), req.user.email, purpose, expiresAt, now());
    }
    await audit(req, `${purpose}.requested`, 'account', String(req.user.id));
    return res.json({ message: `${purpose === 'verify_email' ? 'Verification' : 'Password reset'} request created`, ...(process.env.NODE_ENV === 'test' || process.env.EXPOSE_ACCOUNT_TOKENS === 'true' ? { token: secret } : {}) });
};

const requestEmailVerification = (req, res) => createAccountToken(req, res, 'verify_email');
const confirmEmailVerification = async (req, res) => {
    const token = String(req.body.token || '');
    const connection = req.app.locals.db;
    const row = isPostgresConnection(connection)
        ? await findAccountTokenAsync(connection, hashValue(token), 'verify_email', Date.now())
        : connection.database.prepare("SELECT * FROM account_tokens WHERE token_hash=? AND purpose='verify_email' AND expires_at>?").get(hashValue(token), Date.now());
    if (!row) return res.status(400).json({ message: 'Invalid or expired verification token' });
    if (isPostgresConnection(connection)) {
        await verifyUserEmailAsync(connection, row.email);
        await deleteAccountTokenAsync(connection, hashValue(token));
    } else {
        connection.database.transaction(() => {
            connection.database.prepare('UPDATE users SET email_verified=1 WHERE lower(email)=lower(?)').run(row.email);
            connection.database.prepare('DELETE FROM account_tokens WHERE token_hash=?').run(hashValue(token));
        })();
    }
    return res.json({ message: 'Email verified' });
};

const requestPasswordReset = async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const connection = req.app.locals.db;
    const user = isPostgresConnection(connection)
        ? await findUserByEmailInsensitiveAsync(connection, email)
        : connection.database.prepare('SELECT id,email FROM users WHERE lower(email)=lower(?)').get(email);
    if (!user) return res.json({ message: 'If the account exists, a password reset request was created.' });
    const secret = crypto.randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + 30 * 60 * 1000;
    if (isPostgresConnection(connection)) {
        await insertAccountTokenAsync(connection, {
            tokenHash: hashValue(secret),
            email: user.email,
            purpose: 'password_reset',
            expiresAt,
            createdAt: now(),
        });
    } else {
        connection.database.prepare('INSERT INTO account_tokens (token_hash,email,purpose,expires_at,created_at) VALUES (?,?,?,?,?)').run(hashValue(secret), user.email, 'password_reset', expiresAt, now());
    }
    return res.json({ message: 'If the account exists, a password reset request was created.', ...(process.env.NODE_ENV === 'test' || process.env.EXPOSE_ACCOUNT_TOKENS === 'true' ? { token: secret } : {}) });
};

const confirmPasswordReset = async (req, res) => {
    const token = String(req.body.token || '');
    const password = String(req.body.password || '');
    const connection = req.app.locals.db;
    const row = isPostgresConnection(connection)
        ? await findAccountTokenAsync(connection, hashValue(token), 'password_reset', Date.now())
        : connection.database.prepare("SELECT * FROM account_tokens WHERE token_hash=? AND purpose='password_reset' AND expires_at>?").get(hashValue(token), Date.now());
    if (!row || password.length < 8) return res.status(400).json({ message: 'Valid token and password of at least 8 characters required' });
    const passwordHash = await hashPassword(password);
    const memoryUser = users.find((user) => user.email.toLowerCase() === row.email.toLowerCase());
    if (memoryUser) memoryUser.passwordHash = passwordHash;
    if (isPostgresConnection(connection)) {
        await updateUserPasswordAsync(connection, row.email, passwordHash);
        await deleteAccountTokenAsync(connection, hashValue(token));
    } else {
        connection.database.transaction(() => {
            connection.database.prepare('UPDATE users SET password_hash=? WHERE lower(email)=lower(?)').run(passwordHash, row.email);
            connection.database.prepare('DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM users WHERE lower(email)=lower(?))').run(row.email);
            connection.database.prepare('DELETE FROM account_tokens WHERE token_hash=?').run(hashValue(token));
        })();
    }
    return res.json({ message: 'Password changed. Sign in again.' });
};

module.exports = {
    health,
    globalSearch,
    listJobs,
    createJob,
    cancelJob,
    listNotifications,
    readNotification,
    usageReport,
    auditLog,
    listWebhooks,
    createWebhook,
    deleteWebhook,
    privacyExport,
    requestEmailVerification,
    confirmEmailVerification,
    requestPasswordReset,
    confirmPasswordReset,
    countActiveSessionsAsync,
};
