const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const JOB_TTL_MS = 60 * 60 * 1000;
const jobs = new Map();

function jobStoreDirectory() {
    const dbFile = String(process.env.DB_FILE || '').trim();
    if (!dbFile) return null;
    try {
        return path.join(path.dirname(dbFile), 'image-generation-jobs');
    } catch {
        return null;
    }
}

function jobFilePath(jobId) {
    const dir = jobStoreDirectory();
    if (!dir) return null;
    const safeId = String(jobId || '').replace(/[^a-f0-9-]/gi, '');
    if (!safeId) return null;
    return path.join(dir, `${safeId}.json`);
}

function persistJob(job) {
    const filePath = jobFilePath(job?.id);
    if (!filePath) return;
    try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(job), 'utf8');
    } catch (error) {
        console.warn('[IMAGE] Could not persist job to disk:', error.message);
    }
}

function loadJobFromDisk(jobId) {
    const filePath = jobFilePath(jobId);
    if (!filePath || !fs.existsSync(filePath)) return null;
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function deleteJobFile(jobId) {
    const filePath = jobFilePath(jobId);
    if (!filePath || !fs.existsSync(filePath)) return;
    try {
        fs.unlinkSync(filePath);
    } catch {
        /* ignore */
    }
}

function pruneExpiredJobs() {
    const now = Date.now();
    for (const [id, job] of jobs.entries()) {
        if (now - job.updatedAt > JOB_TTL_MS) {
            jobs.delete(id);
            deleteJobFile(id);
        }
    }
    const dir = jobStoreDirectory();
    if (!dir || !fs.existsSync(dir)) return;
    try {
        for (const name of fs.readdirSync(dir)) {
            if (!name.endsWith('.json')) continue;
            const filePath = path.join(dir, name);
            const stat = fs.statSync(filePath);
            if (now - stat.mtimeMs > JOB_TTL_MS) fs.unlinkSync(filePath);
        }
    } catch {
        /* ignore */
    }
}

function createImageJob({ userId, promptPayload, generationPrompt, quality, aspectRatio, requestedModel }) {
    pruneExpiredJobs();
    const id = crypto.randomUUID();
    const job = {
        id,
        userId: String(userId || ''),
        status: 'queued',
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
    persistJob(job);
    return job;
}

function getImageJob(jobId, userId) {
    pruneExpiredJobs();
    const key = String(jobId || '');
    let job = jobs.get(key);
    if (!job) {
        job = loadJobFromDisk(key);
        if (job) jobs.set(key, job);
    }
    if (!job) return null;
    if (userId && job.userId && job.userId !== String(userId)) return null;
    return job;
}

function updateImageJob(jobId, patch) {
    const key = String(jobId || '');
    let job = jobs.get(key) || loadJobFromDisk(key);
    if (!job) return null;
    Object.assign(job, patch, { updatedAt: Date.now() });
    jobs.set(key, job);
    persistJob(job);
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
            status: 'failed',
            code: job.error.code || 'IMAGE_GENERATION_UNAVAILABLE',
            message: job.error.message,
            retryable: job.error.retryable !== false,
            missingEnvVars: job.error.missingEnvVars,
        };
    }
    if (job.status === 'queued' || job.status === 'processing') {
        return { ...base, success: true };
    }
    return base;
}

module.exports = {
    createImageJob,
    getImageJob,
    updateImageJob,
    publicJobPayload,
};
