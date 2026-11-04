const { normalizeJobStatus } = require('./jobProgressTracker');

const json = (value, fallback = {}) => {
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
};

function buildPublicJobSnapshot(row) {
    if (!row) return null;
    const payload = json(row.payload);
    const meta = payload.jobMeta || {};
    return {
        id: row.id,
        type: row.type,
        status: normalizeJobStatus(row.status),
        progress: row.progress ?? 0,
        stage: row.stage,
        stepIndex: meta.stepIndex ?? null,
        stepTotal: meta.stepTotal ?? null,
        etaSeconds: meta.etaSeconds ?? null,
        etaLabel: meta.etaLabel ?? (row.status === 'running' ? 'Estimating…' : null),
        indeterminate: Boolean(meta.indeterminate),
        payload: { ...payload, jobMeta: undefined },
        result: json(row.result, null),
        error: row.error,
        createdAt: row.created_at ?? row.createdAt,
        updatedAt: row.updated_at ?? row.updatedAt,
    };
}

function buildPublicImageJobSnapshot(job) {
    if (!job) return null;
    const { imageProgressToPercent, normalizeJobStatus } = require('./jobProgressTracker');
    const progress = imageProgressToPercent(job.progress, job.imageCount);
    const stage = job.status === 'completed'
        ? 'Complete'
        : job.status === 'failed'
            ? 'Failed'
            : job.progress?.mode === 'sequential' && job.progress?.total
                ? `Generating image ${Math.min(job.progress.completed + 1, job.progress.total)} of ${job.progress.total}`
                : job.status === 'queued'
                    ? 'Queued'
                    : 'Generating';
    return {
        id: job.id,
        kind: 'image',
        type: 'image-generation',
        status: normalizeJobStatus(job.status),
        progress: progress ?? (job.status === 'completed' ? 100 : job.status === 'queued' ? 0 : null),
        stage,
        stepIndex: job.progress?.completed != null ? job.progress.completed + 1 : null,
        stepTotal: job.progress?.total ?? job.imageCount ?? null,
        etaLabel: progress == null && job.status === 'processing' ? 'Estimating…' : null,
        indeterminate: progress == null && (job.status === 'queued' || job.status === 'processing'),
        result: job.result,
        error: job.error?.message || job.error,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
    };
}

module.exports = {
    buildPublicJobSnapshot,
    buildPublicImageJobSnapshot,
};
