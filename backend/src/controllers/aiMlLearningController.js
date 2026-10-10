const aiMlLearningGateway = require('../services/aiMlLearningGateway');
const { validateLabTrainBody } = require('../services/aiTrainingValidation');

async function getAiLessons(req, res) {
    try {
        const data = await aiMlLearningGateway.proxyGet('/ai/lessons');
        return res.json(data);
    } catch (error) {
        return res.status(error.status || 503).json({ message: error.message || 'AI Learning service unavailable' });
    }
}

async function getAiLesson(req, res) {
    try {
        const data = await aiMlLearningGateway.proxyGet(`/ai/lessons/${encodeURIComponent(req.params.lessonId)}`);
        return res.json(data);
    } catch (error) {
        const status = error.status === 404 ? 404 : (error.status || 503);
        return res.status(status).json({ message: error.message || 'Lesson unavailable' });
    }
}

async function postTrainLinearRegression(req, res) {
    return runTrain(req, res, '/ai/train/linear-regression');
}

async function postTrainGradientDescent(req, res) {
    return runTrain(req, res, '/ai/train/gradient-descent');
}

async function postTrainPytorchLinear(req, res) {
    return runTrain(req, res, '/ai/train/pytorch-linear');
}

async function runTrain(req, res, path) {
    const validation = validateLabTrainBody(req.body);
    if (!validation.ok) {
        return res.status(400).json({ message: validation.message });
    }
    try {
        const data = await aiMlLearningGateway.proxyPost(path, validation.payload);
        return res.json(data);
    } catch (error) {
        return res.status(error.status || 503).json({ message: error.message || 'Training failed' });
    }
}

async function postAiPredict(req, res) {
    const x = Array.isArray(req.body?.x) ? req.body.x : [];
    if (!x.length || x.length > 20) {
        return res.status(400).json({ message: 'Provide x array (1-20 numbers)' });
    }
    const weight = Number(req.body.weight);
    const bias = Number(req.body.bias);
    if (!Number.isFinite(weight) || !Number.isFinite(bias)) {
        return res.status(400).json({ message: 'weight and bias must be numbers' });
    }
    try {
        const data = await aiMlLearningGateway.proxyPost('/ai/predict', { x, weight, bias });
        return res.json(data);
    } catch (error) {
        return res.status(error.status || 503).json({ message: error.message || 'Prediction failed' });
    }
}

async function getTrainingJob(req, res) {
    try {
        const data = await aiMlLearningGateway.proxyGet(`/ai/training/${encodeURIComponent(req.params.id)}`);
        return res.json(data);
    } catch (error) {
        const status = error.status === 404 ? 404 : (error.status || 503);
        return res.status(status).json({ message: error.message || 'Training job not found' });
    }
}

async function postImprovementAnalyze(req, res) {
    try {
        const data = await aiMlLearningGateway.proxyPost('/improvement/analyze', req.body || {});
        return res.json(data);
    } catch (error) {
        return res.status(error.status || 503).json({ message: error.message || 'Improvement analysis failed' });
    }
}

async function getTrainingMetrics(req, res) {
    try {
        const data = await aiMlLearningGateway.proxyGet(
            `/ai/training/${encodeURIComponent(req.params.id)}/metrics`,
        );
        return res.json(data);
    } catch (error) {
        const status = error.status === 404 ? 404 : (error.status || 503);
        return res.status(status).json({ message: error.message || 'Metrics unavailable' });
    }
}

module.exports = {
    getAiLessons,
    getAiLesson,
    postTrainLinearRegression,
    postTrainGradientDescent,
    postTrainPytorchLinear,
    postAiPredict,
    getTrainingJob,
    getTrainingMetrics,
    postImprovementAnalyze,
};
