const aiPythonBridge = require('./aiPythonBridge');
const { watchTrainingUntilSettled } = require('./aiPythonWebhooks');

const now = () => new Date().toISOString();
const json = (value, fallback = {}) => {
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
};

const runPyTorchTrainJob = async (app, jobId) => {
    const db = app.locals.db.database;
    const row = db.prepare('SELECT * FROM background_jobs WHERE id = ?').get(jobId);
    if (!row || row.status !== 'queued') return;

    const payload = json(row.payload);
    db.prepare("UPDATE background_jobs SET status='running', progress=10, stage='Starting PyTorch training', updated_at=? WHERE id=?").run(
        now(),
        jobId
    );

    try {
        const config = {
            epochs: payload.epochs ?? 40,
            lr: payload.lr ?? 0.005,
            batchSize: payload.batchSize ?? 16,
            openaiAugment: Boolean(payload.openaiAugment),
            openaiSamplesPerClass: payload.openaiSamplesPerClass ?? 2,
        };

        await aiPythonBridge.startTraining(config);
        db.prepare("UPDATE background_jobs SET progress=25, stage='Training in progress', updated_at=? WHERE id=?").run(now(), jobId);

        watchTrainingUntilSettled(app, row.email, { jobId, config });

        const startedAt = Date.now();
        const timeoutMs = Math.max(120000, parseInt(process.env.AI_PYTHON_TRAIN_WATCH_MS || '900000', 10));

        while (Date.now() - startedAt < timeoutMs) {
            const current = db.prepare('SELECT status FROM background_jobs WHERE id=?').get(jobId);
            if (!current || current.status === 'canceled') return;

            const status = await aiPythonBridge.getStatus();
            const progress = Math.min(
                95,
                25 + Math.round((status?.progress_percent || 0) * 0.7)
            );
            db.prepare('UPDATE background_jobs SET progress=?, stage=?, updated_at=? WHERE id=?').run(
                progress,
                status?.is_training ? `Epoch ${status.current_epoch}/${status.total_epochs}` : 'Finalizing',
                now(),
                jobId
            );

            if (!status?.is_training && status?.completed_at) break;
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        const finalStatus = await aiPythonBridge.getStatus();
        const result = {
            completed: true,
            config,
            metrics: {
                last_accuracy: finalStatus?.last_accuracy,
                best_loss: finalStatus?.best_loss,
                early_stopping: finalStatus?.early_stopping,
                training_outcome: finalStatus?.training_outcome,
            },
            completedAt: now(),
        };

        db.transaction(() => {
            db.prepare("UPDATE background_jobs SET status='completed', progress=100, stage='Complete', result=?, updated_at=? WHERE id=?").run(
                JSON.stringify(result),
                now(),
                jobId
            );
            db.prepare('INSERT INTO notifications (id,email,title,message,kind,created_at) VALUES (?,?,?,?,?,?)').run(
                `notification-${Date.now()}`,
                row.email,
                'PyTorch training finished',
                'Your pytorch-train background job completed.',
                'job',
                now()
            );
        })();
    } catch (err) {
        db.prepare("UPDATE background_jobs SET status='failed', stage='Failed', error=?, updated_at=? WHERE id=?").run(
            err.message,
            now(),
            jobId
        );
    }
};

module.exports = { runPyTorchTrainJob };
