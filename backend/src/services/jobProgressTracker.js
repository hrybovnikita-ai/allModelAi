/**
 * Step-based progress (0–100) and ETA from completed step durations only.
 * No simulated advancement — progress moves when reportStep() is called after real work.
 */

function clampProgress(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
}

function createStepProgressReporter(totalSteps, { onReport } = {}) {
    const total = Math.max(1, Number(totalSteps) || 1);
    const stepStartedAt = [];
    const stepDurationsMs = [];
    let currentStep = 0;

    const progressForStep = (stepIndex) => {
        const idx = Math.max(0, Math.min(total - 1, stepIndex));
        if (total === 1) return idx >= 0 ? 100 : 0;
        return clampProgress((idx / total) * 100);
    };

    const estimateRemainingSeconds = () => {
        if (stepDurationsMs.length < 2) return null;
        const avg = stepDurationsMs.reduce((a, b) => a + b, 0) / stepDurationsMs.length;
        const remainingSteps = Math.max(0, total - currentStep);
        if (!remainingSteps) return 0;
        return Math.max(1, Math.round((avg * remainingSteps) / 1000));
    };

    const reportStep = (stepIndex, stageLabel, extras = {}) => {
        const now = Date.now();
        if (currentStep > 0 && stepStartedAt[currentStep]) {
            stepDurationsMs.push(now - stepStartedAt[currentStep]);
        }
        currentStep = stepIndex;
        stepStartedAt[stepIndex] = now;
        const progress = progressForStep(stepIndex);
        const etaSeconds = estimateRemainingSeconds();
        const snapshot = {
            stepIndex: stepIndex + 1,
            stepTotal: total,
            stage: stageLabel,
            progress,
            etaSeconds,
            etaLabel: etaSeconds == null ? 'Estimating…' : `~${etaSeconds} sec`,
            indeterminate: etaSeconds == null && stepIndex < total - 1,
            ...extras,
        };
        if (typeof onReport === 'function') onReport(snapshot);
        return snapshot;
    };

    const complete = (stageLabel = 'Complete') => {
        const now = Date.now();
        if (currentStep > 0 && stepStartedAt[currentStep]) {
            stepDurationsMs.push(now - stepStartedAt[currentStep]);
        }
        const snapshot = {
            stepIndex: total,
            stepTotal: total,
            stage: stageLabel,
            progress: 100,
            etaSeconds: 0,
            etaLabel: null,
            indeterminate: false,
        };
        if (typeof onReport === 'function') onReport(snapshot);
        return snapshot;
    };

    return { reportStep, complete, progressForStep };
}

function imageProgressToPercent(progress, imageCount = 1) {
    if (!progress || typeof progress !== 'object') return null;
    const total = Number(progress.total || imageCount || 0);
    const completed = Number(progress.completed || 0);
    if (total > 0) return clampProgress((completed / total) * 100);
    if (progress.percent != null) return clampProgress(progress.percent);
    return null;
}

function normalizeJobStatus(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'canceled' || s === 'cancelled') return 'cancelled';
    if (s === 'processing') return 'running';
    return s || 'queued';
}

module.exports = {
    clampProgress,
    createStepProgressReporter,
    imageProgressToPercent,
    normalizeJobStatus,
};
