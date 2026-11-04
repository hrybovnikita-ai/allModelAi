const crypto = require('node:crypto');
const { isPostgresConnection } = require('../db/postgresHttpReads');
const {
    getBackgroundJobAsync,
    updateBackgroundJobAsync,
    insertNotificationAsync,
} = require('../db/postgresHttpProduction');
const knowledgeBaseService = require('./rag/knowledgeBaseService');
const { createStepProgressReporter } = require('./jobProgressTracker');
const jobEventHub = require('./jobEventHub');
const { runPyTorchTrainJob } = require('./aiPythonJobRunner');
const { buildPublicJobSnapshot } = require('./jobPublicSnapshot');

const now = () => new Date().toISOString();
const json = (value, fallback = {}) => {
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
};

const activeAbortControllers = new Map();

function requestJobAbort(jobId) {
    const controller = activeAbortControllers.get(jobId);
    if (controller) controller.abort();
}

async function readJobRow(connection, jobId) {
    if (isPostgresConnection(connection)) {
        return getBackgroundJobAsync(connection, jobId);
    }
    return connection.database.prepare('SELECT * FROM background_jobs WHERE id = ?').get(jobId);
}

async function isJobCancelled(connection, jobId) {
    const row = await readJobRow(connection, jobId);
    return !row || row.status === 'canceled';
}

async function patchJob(connection, jobId, patch) {
    const updatedAt = patch.updatedAt || now();
    const payloadPatch = patch.jobMeta ? { jobMeta: patch.jobMeta } : null;
    delete patch.jobMeta;
    delete patch.updatedAt;

    if (isPostgresConnection(connection)) {
        if (payloadPatch) {
            const row = await getBackgroundJobAsync(connection, jobId);
            const payload = json(row?.payload);
            payload.jobMeta = { ...(payload.jobMeta || {}), ...payloadPatch.jobMeta };
            await updateBackgroundJobAsync(connection, jobId, {
                ...patch,
                payload: JSON.stringify(payload),
                updatedAt,
            });
        } else {
            await updateBackgroundJobAsync(connection, jobId, { ...patch, updatedAt });
        }
    } else {
        const db = connection.database;
        const row = db.prepare('SELECT * FROM background_jobs WHERE id = ?').get(jobId);
        if (!row) return;
        const fields = [];
        const values = [];
        if (patch.status !== undefined) {
            fields.push('status = ?');
            values.push(patch.status);
        }
        if (patch.progress !== undefined) {
            fields.push('progress = ?');
            values.push(patch.progress);
        }
        if (patch.stage !== undefined) {
            fields.push('stage = ?');
            values.push(patch.stage);
        }
        if (patch.result !== undefined) {
            fields.push('result = ?');
            values.push(patch.result);
        }
        if (patch.error !== undefined) {
            fields.push('error = ?');
            values.push(patch.error);
        }
        if (payloadPatch) {
            const payload = json(row.payload);
            payload.jobMeta = { ...(payload.jobMeta || {}), ...payloadPatch.jobMeta };
            fields.push('payload = ?');
            values.push(JSON.stringify(payload));
        }
        fields.push('updated_at = ?');
        values.push(updatedAt);
        values.push(jobId);
        db.prepare(`UPDATE background_jobs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }

    const fresh = await readJobRow(connection, jobId);
    if (fresh) {
        jobEventHub.publish(jobId, buildPublicJobSnapshot(fresh));
    }
}

async function failJob(connection, jobId, email, message) {
    await patchJob(connection, jobId, {
        status: 'failed',
        stage: 'Failed',
        error: String(message || 'Job failed').slice(0, 500),
    });
}

async function completeJob(connection, jobId, email, result) {
    await patchJob(connection, jobId, {
        status: 'completed',
        progress: 100,
        stage: 'Complete',
        result: JSON.stringify(result),
    });
    const notificationId = `notification-${crypto.randomUUID()}`;
    if (isPostgresConnection(connection)) {
        await insertNotificationAsync(connection, {
            id: notificationId,
            email,
            title: 'Background task finished',
            message: 'Your background job is ready to review.',
            kind: 'job',
            createdAt: now(),
        });
    } else {
        connection.database.prepare(
            'INSERT INTO notifications (id,email,title,message,kind,created_at) VALUES (?,?,?,?,?,?)',
        ).run(notificationId, email, 'Background task finished', 'Your background job is ready to review.', 'job', now());
    }
}

async function runDocumentJob(app, row) {
    const connection = app.locals.db;
    const payload = json(row.payload);
    const reporter = createStepProgressReporter(4, {
        onReport: (snap) => {
            void patchJob(connection, row.id, {
                status: 'running',
                progress: snap.progress,
                stage: snap.stage,
                jobMeta: {
                    stepIndex: snap.stepIndex,
                    stepTotal: snap.stepTotal,
                    etaSeconds: snap.etaSeconds,
                    etaLabel: snap.etaLabel,
                    indeterminate: snap.indeterminate,
                },
            });
        },
    });

    reporter.reportStep(0, 'Preparing document');
    if (await isJobCancelled(connection, row.id)) return;

    const name = String(payload.name || payload.objective || 'Document').slice(0, 200);
    const content = String(payload.content || '').trim();
    if (!content && !payload.workspaceItemId) {
        throw new Error('Document job requires payload.content or a workspace document reference.');
    }

    let input = {
        name,
        content,
        mimeType: payload.mimeType || 'text/plain',
        pages: payload.pages,
        collectionId: payload.collectionId,
        id: payload.documentId,
    };

    if (!content && payload.workspaceItemId) {
        reporter.reportStep(1, 'Loading workspace document');
        let item;
        if (isPostgresConnection(connection)) {
            const { getWorkspaceItemAsync } = require('../db/postgresHttpWorkspace');
            item = await getWorkspaceItemAsync(connection, payload.workspaceItemId, row.email);
        } else {
            item = connection.database.prepare(
                'SELECT data FROM workspace_items WHERE id = ? AND email = ?',
            ).get(payload.workspaceItemId, row.email);
        }
        const data = json(item?.data);
        input = {
            ...input,
            name: data.name || name,
            content: String(data.content || ''),
        };
    }

    reporter.reportStep(1, 'Chunking content');
    if (await isJobCancelled(connection, row.id)) return;

    const indexResult = await knowledgeBaseService.indexDocument(connection, row.email, input, {
        onProgress: ({ stage, progress, chunkIndex, chunkTotal }) => {
            void patchJob(connection, row.id, {
                status: 'running',
                progress: progress ?? reporter.progressForStep(2),
                stage: stage || (chunkTotal
                    ? `Embedding chunk ${chunkIndex} of ${chunkTotal}`
                    : 'Analyzing content'),
                jobMeta: {
                    stepIndex: 3,
                    stepTotal: 4,
                    chunkIndex,
                    chunkTotal,
                },
            });
        },
    });

    reporter.complete('Complete');
    await completeJob(connection, row.id, row.email, {
        documentId: indexResult.id,
        chunkCount: indexResult.chunkCount,
        completedAt: now(),
    });
}

async function runWorkspaceArtifactJob(app, row) {
    const connection = app.locals.db;
    const payload = json(row.payload);
    const reporter = createStepProgressReporter(3, {
        onReport: (snap) => {
            void patchJob(connection, row.id, {
                status: 'running',
                progress: snap.progress,
                stage: snap.stage,
                jobMeta: {
                    stepIndex: snap.stepIndex,
                    stepTotal: snap.stepTotal,
                    etaSeconds: snap.etaSeconds,
                    etaLabel: snap.etaLabel,
                    indeterminate: snap.indeterminate,
                },
            });
        },
    });

    reporter.reportStep(0, 'Validating input');
    const objective = String(payload.objective || payload.name || '').trim();
    if (!objective) {
        throw new Error('Job payload must include objective or name.');
    }
    if (await isJobCancelled(connection, row.id)) return;

    reporter.reportStep(1, 'Saving workspace record');
    const id = `ws-${crypto.randomUUID()}`;
    const createdAt = now();
    const data = {
        name: objective.slice(0, 200),
        content: payload.content || payload.notes || objective,
        sourceJobId: row.id,
        jobType: row.type,
    };
    if (isPostgresConnection(connection)) {
        const { insertWorkspaceItemAsync } = require('../db/postgresHttpWorkspace');
        await insertWorkspaceItemAsync(connection, {
            id,
            email: row.email,
            type: row.type === 'research' ? 'document' : row.type,
            data,
            createdAt,
            updatedAt: createdAt,
        });
    } else {
        connection.database.prepare(
            'INSERT INTO workspace_items (id, email, type, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(id, row.email, row.type === 'research' ? 'document' : row.type, JSON.stringify(data), createdAt, createdAt);
    }

    reporter.complete('Complete');
    await completeJob(connection, row.id, row.email, {
        workspaceItemId: id,
        completedAt: now(),
    });
}

async function runBackgroundJob(app, jobId) {
    const connection = app.locals.db;
    const row = await readJobRow(connection, jobId);
    if (!row || row.status !== 'queued') return;

    if (row.type === 'pytorch-train') {
        return runPyTorchTrainJob(app, jobId);
    }

    const abort = new AbortController();
    activeAbortControllers.set(jobId, abort);

    try {
        await patchJob(connection, jobId, {
            status: 'running',
            progress: 0,
            stage: 'Starting',
        });

        if (row.type === 'document') {
            await runDocumentJob(app, row);
        } else if (['research', 'evaluation', 'meeting', 'workflow'].includes(row.type)) {
            await runWorkspaceArtifactJob(app, row);
        } else {
            throw new Error(`Unsupported job type: ${row.type}`);
        }
    } catch (error) {
        if (await isJobCancelled(connection, jobId)) {
            await patchJob(connection, jobId, {
                status: 'canceled',
                stage: 'Cancelled',
            });
        } else {
            await failJob(connection, jobId, row.email, error.message || 'Job failed');
        }
    } finally {
        activeAbortControllers.delete(jobId);
    }
}

module.exports = {
    runBackgroundJob,
    patchJob,
    requestJobAbort,
    readJobRow,
};
