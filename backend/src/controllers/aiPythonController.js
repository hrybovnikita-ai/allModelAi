const aiPythonBridge = require('../services/aiPythonBridge');

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
        const { epochs = 60, lr = 0.005, batchSize = 16 } = req.body || {};
        const parsedEpochs = Math.max(5, Math.min(parseInt(epochs, 10) || 60, 500));
        const parsedLr = Math.max(0.0001, Math.min(parseFloat(lr) || 0.005, 0.1));
        const parsedBatch = Math.max(4, Math.min(parseInt(batchSize, 10) || 16, 64));

        const result = await aiPythonBridge.startTraining({
            epochs: parsedEpochs,
            lr: parsedLr,
            batchSize: parsedBatch,
        });

        return res.json({
            success: true,
            message: 'PyTorch AI learning initiated',
            config: { epochs: parsedEpochs, lr: parsedLr, batchSize: parsedBatch },
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

module.exports = {
    getPyTorchStatus,
    startPyTorchTraining,
    predictPyTorch,
    resetPyTorchModel,
};
