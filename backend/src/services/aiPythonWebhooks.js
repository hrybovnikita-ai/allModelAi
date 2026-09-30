const crypto = require('node:crypto');

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

const { isPostgresConnection } = require('../db/postgresHttpReads');
const { listWebhooksForEmailAsync } = require('../db/postgresHttpProduction');

const dispatchTrainingWebhooks = async (app, email, event, payload) => {
    const connection = app?.locals?.db;
    if (!connection || !email) return;

    let hooks = [];
    try {
        hooks = isPostgresConnection(connection)
            ? await listWebhooksForEmailAsync(connection, email)
            : connection.database.prepare('SELECT id, url, secret_hash FROM webhooks WHERE email = ?').all(email);
    } catch {
        return;
    }

    const body = JSON.stringify({
        event,
        source: 'ai-python-lab',
        timestamp: new Date().toISOString(),
        ...payload,
    });

    await Promise.allSettled(
        hooks.map(async (hook) => {
            const headers = { 'Content-Type': 'application/json' };
            if (hook.secret_hash) {
                headers['X-AllModelAI-Signature'] = hash(`${hook.secret_hash}:${body}`);
            }
            await fetch(hook.url, { method: 'POST', headers, body });
        })
    );
};

const watchTrainingUntilSettled = (app, email, meta = {}) => {
    const aiPythonBridge = require('./aiPythonBridge');
    const startedAt = Date.now();
    const timeoutMs = Math.max(60000, parseInt(process.env.AI_PYTHON_TRAIN_WATCH_MS || '900000', 10));

    const poll = async () => {
        try {
            const status = await aiPythonBridge.getStatus();
            if (status?.is_training) {
                if (Date.now() - startedAt > timeoutMs) return;
                return setTimeout(poll, 2000);
            }

            const outcome = status?.training_outcome || (status?.last_training_error ? 'failed' : 'completed');
            const event = outcome === 'failed' ? 'training.failed' : 'training.completed';
            await dispatchTrainingWebhooks(app, email, event, {
                outcome,
                metrics: {
                    last_accuracy: status?.last_accuracy,
                    best_loss: status?.best_loss,
                    early_stopping: status?.early_stopping,
                },
                ...meta,
            });
        } catch {
            if (Date.now() - startedAt < timeoutMs) {
                setTimeout(poll, 3000);
            }
        }
    };

    if (process.env.NODE_ENV !== 'test') {
        setTimeout(poll, 1500);
    }
};

module.exports = {
    dispatchTrainingWebhooks,
    watchTrainingUntilSettled,
};
