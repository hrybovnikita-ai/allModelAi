const { getCreditStatusCoreAsync } = require('../billing/creditStatusAsync');
const { getPlatformCapabilities } = require('../platform/featureAccess');
const {
    listJobsForUser,
    getJobForUser,
    enqueuePlatformJob,
    cancelJobForUser,
} = require('../platform/platformJobService');
const { JOB_TYPES } = require('../platform/featureRegistry');

async function resolveAccess(req) {
    if (req.access || req.creditStatus) return req.access || req.creditStatus;
    return getCreditStatusCoreAsync(req.app.locals.db, req.user.email);
}

async function getCapabilities(req, res) {
    const connection = req.app.locals.db;
    const access = await resolveAccess(req);
    const payload = await getPlatformCapabilities(connection, req.user.email, access);
    return res.status(200).json(payload);
}

async function listPlatformJobs(req, res) {
    const jobs = await listJobsForUser(req.app.locals.db, req.user.email);
    return res.status(200).json({ jobs });
}

async function getPlatformJob(req, res) {
    const job = await getJobForUser(req.app.locals.db, req.params.id, req.user.email);
    if (!job) return res.status(404).json({ message: 'Job not found.' });
    return res.status(200).json(job);
}

async function createPlatformJob(req, res) {
    const type = String(req.body.type || '').trim();
    if (!type) {
        return res.status(400).json({ message: 'Job type is required.', allowedTypes: Object.keys(JOB_TYPES) });
    }
    try {
        const access = await resolveAccess(req);
        const job = await enqueuePlatformJob(req.app.locals.db, {
            email: req.user.email,
            type,
            payload: req.body.payload || {},
            access,
            ip: req.ip,
        });
        return res.status(202).json(job);
    } catch (error) {
        const status = error.status || 500;
        return res.status(status).json({
            code: error.code || 'JOB_enqueue_FAILED',
            message: error.message,
            featureId: error.featureId,
        });
    }
}

async function cancelPlatformJob(req, res) {
    try {
        const job = await cancelJobForUser(req.app.locals.db, req.params.id, req.user.email);
        return res.status(200).json(job);
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.message });
    }
}

module.exports = {
    getCapabilities,
    listPlatformJobs,
    getPlatformJob,
    createPlatformJob,
    cancelPlatformJob,
};
