const aiPythonBridge = require('../services/aiPythonBridge');
const { recordTrainingRun } = require('./storageIdeasController');

/**
 * GET /api/ai-python/status
 */
const getPyTorchStatus = async (req, res) => {
    try {
        const status = await aiPythonBridge.getStatus();
        return res.json(status);
    } catch (err) {
        return res.status(500).json({
            error: 'Failed to retrieve PyTorch AI status',
            message: err.message,
        });
    }
};

/**
 * POST /api/ai-python/train
 */
const startPyTorchTraining = async (req, res) => {
    try {
        const {
            epochs = 60,
            lr = 0.005,
            batchSize = 16,
            openaiAugment = false,
            openaiSamplesPerClass = 2,
        } = req.body || {};
        const parsedEpochs = Math.max(5, Math.min(parseInt(epochs, 10) || 60, 500));
        const parsedLr = Math.max(0.0001, Math.min(parseFloat(lr) || 0.005, 0.1));
        const parsedBatch = Math.max(4, Math.min(parseInt(batchSize, 10) || 16, 64));
        const parsedOpenAiPerClass = Math.max(1, Math.min(parseInt(openaiSamplesPerClass, 10) || 2, 5));

        const result = await aiPythonBridge.startTraining({
            epochs: parsedEpochs,
            lr: parsedLr,
            batchSize: parsedBatch,
            openaiAugment: Boolean(openaiAugment),
            openaiSamplesPerClass: parsedOpenAiPerClass,
        });

        const config = {
            epochs: parsedEpochs,
            lr: parsedLr,
            batchSize: parsedBatch,
            openaiAugment: Boolean(openaiAugment),
            openaiSamplesPerClass: parsedOpenAiPerClass,
        };
        let trainingRunId = null;
        if (req.user?.email && req.app.locals.db?.database) {
            trainingRunId = recordTrainingRun(
                req.app.locals.db.database,
                req.user.email,
                config,
                result?.metrics || result || {}
            );
        }

        return res.json({
            success: true,
            message: 'PyTorch AI learning initiated',
            config,
            trainingRunId,
            result,
        });
    } catch (err) {
        return res.status(500).json({
            error: 'Failed to start PyTorch training',
            message: err.message,
        });
    }
};

/**
 * POST /api/ai-python/predict
 */
const predictPyTorch = async (req, res) => {
    try {
        const { text } = req.body || {};
        if (!text || typeof text !== 'string' || !text.trim()) {
            return res.status(400).json({ message: 'Input text is required for prediction.' });
        }

        const prediction = await aiPythonBridge.predict(text.trim());
        return res.json(prediction);
    } catch (err) {
        return res.status(500).json({
            error: 'PyTorch prediction failed',
            message: err.message,
        });
    }
};

/**
 * POST /api/ai-python/reset
 */
const resetPyTorchModel = async (req, res) => {
    try {
        const result = await aiPythonBridge.resetModel();
        return res.json({ success: true, result });
    } catch (err) {
        return res.status(500).json({
            error: 'Failed to reset PyTorch model',
            message: err.message,
        });
    }
};

const getOpenAiTrainingStatus = async (req, res) => {
    try {
        const status = await aiPythonBridge.getOpenAiStatus();
        return res.json(status);
    } catch (err) {
        return res.status(500).json({
            error: 'Failed to retrieve OpenAI training status',
            message: err.message,
        });
    }
};

const augmentPyTorchDataset = async (req, res) => {
    try {
        const samplesPerClass = Math.max(1, Math.min(parseInt(req.body?.samplesPerClass, 10) || 2, 5));
        const result = await aiPythonBridge.augmentWithOpenAi({ samplesPerClass });
        return res.json(result);
    } catch (err) {
        return res.status(500).json({
            error: 'OpenAI dataset augmentation failed',
            message: err.message,
        });
    }
};

module.exports = {
    getPyTorchStatus,
    startPyTorchTraining,
    predictPyTorch,
    resetPyTorchModel,
    getOpenAiTrainingStatus,
    augmentPyTorchDataset,
};
