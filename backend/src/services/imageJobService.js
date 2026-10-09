const crypto = require('node:crypto');

const JOB_TTL_MS = 60 * 60 * 1000;
const jobs = new Map();

function pruneExpiredJobs() {
    const now = Date.now();
    for (const [id, job] of jobs.entries()) {
        if (now - job.updatedAt > JOB_TTL_MS) jobs.delete(id);
    }
}

function createImageJob({ userId, promptPayload, generationPrompt, quality, aspectRatio, requestedModel }) {
    pruneExpiredJobs();
    const id = crypto.randomUUID();
    const job = {
        id,
        userId: String(userId || ''),
        status: 'processing',
        promptPayload,
        generationPrompt,
        quality,
        aspectRatio,
        requestedModel,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        result: null,
        error: null,
    };
    jobs.set(id, job);
    return job;
}

function getImageJob(jobId, userId) {
    pruneExpiredJobs();
    const job = jobs.get(String(jobId || ''));
    if (!job) return null;
    if (userId && job.userId && job.userId !== String(userId)) return null;
    return job;
}

function updateImageJob(jobId, patch) {
    const job = jobs.get(String(jobId || ''));
    if (!job) return null;
    Object.assign(job, patch, { updatedAt: Date.now() });
    return job;
}

function publicJobPayload(job) {
    if (!job) return null;
    const base = {
        jobId: job.id,
        status: job.status,
        updatedAt: job.updatedAt,
    };
    if (job.status === 'completed' && job.result) {
        return { ...base, ...job.result, success: true };
    }
    if (job.status === 'failed' && job.error) {
        return {
            ...base,
            success: false,
            code: job.error.code || 'IMAGE_GENERATION_UNAVAILABLE',
            message: job.error.message,
        };
    }
    return base;
}

module.exports = {
    createImageJob,
    getImageJob,
    updateImageJob,
    publicJobPayload,
};
