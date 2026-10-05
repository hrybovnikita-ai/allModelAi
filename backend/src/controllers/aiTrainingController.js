const aiTrainingLabBridge = require('../services/aiTrainingLabBridge');
const { validateLabTrainBody } = require('../services/aiTrainingValidation');
const {
    listProgress,
    upsertProgress,
    recordExperiment,
    listExperiments,
} = require('../services/aiTrainingProgressService');
const { askTutor, tutorAvailability } = require('../services/aiTrainingTutorService');
const { checkTrainQuota, consumeTrainQuota } = require('../services/aiPythonQuotas');
const deepResearchService = require('../services/deepResearchService');

const LAB_ROUTES = {
    'linear-regression': '/labs/linear-regression/train',
    'gradient-descent': '/labs/gradient-descent/train',
    'pytorch-intro': '/labs/pytorch/train',
};

async function getLessons(req, res) {
    try {
        const catalog = await aiTrainingLabBridge.getLessonsCatalog();
        const connection = req.app.locals.db;
        let progress = [];
        if (req.user?.email) {
            progress = await listProgress(connection, req.user.email);
        }
        return res.json({ ...catalog, progress });
    } catch (error) {
        return res.status(503).json({
            message: error.message || 'AI Training catalog unavailable',
            hint: 'Ensure Python ai_python service is installed (numpy, fastapi).',
        });
    }
}

async function getLessonById(req, res) {
    try {
        const detail = await aiTrainingLabBridge.getLessonDetail(req.params.id);
        if (!detail.ok && detail.error === 'Lesson not found') {
            return res.status(404).json({ message: 'Lesson not found' });
        }
        let progress = null;
        if (req.user?.email) {
            const rows = await listProgress(req.app.locals.db, req.user.email);
            progress = rows.find((row) => row.lessonId === req.params.id) || null;
        }
        return res.json({ ...detail, progress });
    } catch (error) {
        return res.status(503).json({ message: error.message || 'Lesson unavailable' });
    }
}

async function getProgress(req, res) {
    const rows = await listProgress(req.app.locals.db, req.user.email);
    return res.json({ progress: rows });
}

async function patchProgress(req, res) {
    const lessonId = String(req.params.lessonId || '').trim();
    if (!lessonId) {
        return res.status(400).json({ message: 'lessonId required' });
    }
    const row = await upsertProgress(req.app.locals.db, req.user.email, lessonId, {
        progress: req.body.progress,
        completed: req.body.completed,
    });
    return res.json(row);
}

async function getExperiments(req, res) {
    const rows = await listExperiments(req.app.locals.db, req.user.email, req.query.limit);
    return res.json({ experiments: rows });
}

async function runLabTrain(req, res, lessonId, labPath) {
    const validation = validateLabTrainBody(req.body);
    if (!validation.ok) {
        return res.status(400).json({ message: validation.message });
    }

    const quota = checkTrainQuota(req.user.email);
    if (!quota.allowed) {
        return res.status(429).json({ message: quota.message, quota });
    }

    try {
        const result = await aiTrainingLabBridge.postLab(labPath, validation.payload);
        if (!result.ok) {
            return res.status(400).json({ message: result.error || 'Training failed', result });
        }
        consumeTrainQuota(req.user.email);

        const summary = {
            finalLoss: result.finalLoss,
            finalWeight: result.finalWeight,
            finalBias: result.finalBias,
            epochs: validation.payload.epochs,
            learningRate: validation.payload.learning_rate,
        };
        const experiment = await recordExperiment(
            req.app.locals.db,
            req.user.email,
            lessonId,
            lessonId,
            validation.payload,
            summary,
        );

        await upsertProgress(req.app.locals.db, req.user.email, lessonId, {
            progress: 1,
            completed: 1,
        });

        return res.json({ ...result, experimentId: experiment.id });
    } catch (error) {
        const status = error.status || 503;
        return res.status(status).json({
            message: error.message || 'Training service unavailable',
        });
    }
}

async function trainLinearRegression(req, res) {
    return runLabTrain(req, res, 'linear-regression', LAB_ROUTES['linear-regression']);
}

async function trainGradientDescent(req, res) {
    return runLabTrain(req, res, 'gradient-descent', LAB_ROUTES['gradient-descent']);
}

async function trainPytorchLab(req, res) {
    return runLabTrain(req, res, 'pytorch-intro', LAB_ROUTES['pytorch-intro']);
}

async function postTutor(req, res) {
    const availability = tutorAvailability();
    const result = await askTutor({
        message: req.body.message,
        lessonContext: req.body.lessonContext || { lessonId: req.body.lessonId },
        history: req.body.history,
    });
    if (result.unavailable) {
        return res.status(503).json({
            unavailable: true,
            message: result.message,
            tutor: availability,
        });
    }
    if (!result.ok) {
        return res.status(result.status || 502).json({ message: result.error || 'Tutor error' });
    }
    return res.json(result);
}

async function getTutorStatus(req, res) {
    return res.json(tutorAvailability());
}

async function researchLessonTopic(req, res) {
    const query = String(req.body.query || '').trim().slice(0, 500);
    if (!query) {
        return res.status(400).json({ message: 'query is required' });
    }
    const depth = deepResearchService.normalizeDepth(req.body.depth || 'standard');
    const timeRange = deepResearchService.normalizeTimeRange(req.body.timeRange);
    try {
        const payload = await deepResearchService.collectDeepResearch({ query, depth, timeRange });
        return res.json(payload);
    } catch (error) {
        const mapped = deepResearchService.mapErrorToResponse(error);
        return res.status(mapped.status).json(mapped.body);
    }
}

module.exports = {
    getLessons,
    getLessonById,
    getProgress,
    patchProgress,
    getExperiments,
    trainLinearRegression,
    trainGradientDescent,
    trainPytorchLab,
    postTutor,
    getTutorStatus,
    researchLessonTopic,
};
