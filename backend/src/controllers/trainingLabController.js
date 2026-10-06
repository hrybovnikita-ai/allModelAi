const aiMlLearningGateway = require('../services/aiMlLearningGateway');
const { validateModelLabStartBody, validateModelLabPredictBody } = require('../services/aiTrainingValidation');

function mapServiceError(res, error, fallback) {
    const status = error.status || 503;
    const message = error.message || fallback;
    if (status >= 500 && process.env.NODE_ENV !== 'production') {
        return res.status(status).json({ message, code: 'PYTHON_SERVICE_ERROR' });
    }
    return res.status(status).json({ message });
}

async function getTrainingHealth(req, res) {
    try {
        const data = await aiMlLearningGateway.proxyGet('/training/health');
        return res.json(data);
    } catch (error) {
        return mapServiceError(res, error, 'AI Training service unavailable');
    }
}

async function getTrainingModels(req, res) {
    try {
        const data = await aiMlLearningGateway.proxyGet('/training/models');
        return res.json(data);
    } catch (error) {
        return mapServiceError(res, error, 'Could not load training models');
    }
}

async function postTrainingStart(req, res) {
    const validation = validateModelLabStartBody(req.body);
    if (!validation.ok) {
        return res.status(400).json({ message: validation.message });
    }
    try {
        const data = await aiMlLearningGateway.proxyPost('/training/start', validation.payload);
        return res.status(201).json(data);
    } catch (error) {
        return mapServiceError(res, error, 'Training could not be started');
    }
}

async function getTrainingRun(req, res) {
    try {
        const data = await aiMlLearningGateway.proxyGet(`/training/${encodeURIComponent(req.params.runId)}`);
        return res.json(data);
    } catch (error) {
        const status = error.status === 404 ? 404 : (error.status || 503);
        return res.status(status).json({ message: error.message || 'Training run not found' });
    }
}

async function postTrainingPredict(req, res) {
    const validation = validateModelLabPredictBody(req.body);
    if (!validation.ok) {
        return res.status(400).json({ message: validation.message });
    }
    try {
        const data = await aiMlLearningGateway.proxyPost(
            `/training/${encodeURIComponent(req.params.runId)}/predict`,
            validation.payload,
        );
        return res.json(data);
    } catch (error) {
        return mapServiceError(res, error, 'Prediction failed');
    }
}

async function postTrainingOpenAiChat(req, res) {
    const prompt = String(req.body?.prompt || '').trim();
    if (!prompt || prompt.length > 4000) {
        return res.status(400).json({ message: 'prompt is required (max 4000 characters)' });
    }
    try {
        const data = await aiMlLearningGateway.proxyPost('/training/openai/chat', {
            prompt,
            model: req.body?.model,
        });
        return res.json(data);
    } catch (error) {
        return mapServiceError(res, error, 'OpenAI request failed');
    }
}

module.exports = {
    getTrainingHealth,
    getTrainingModels,
    postTrainingStart,
    getTrainingRun,
    postTrainingPredict,
    postTrainingOpenAiChat,
};
