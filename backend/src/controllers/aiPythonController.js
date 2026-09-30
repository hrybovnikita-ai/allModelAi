const aiPythonBridge = require('../services/aiPythonBridge');
const {
    checkTrainQuota,
    consumeTrainQuota,
    checkPredictQuota,
    consumePredictQuota,
    getQuotaSnapshot,
} = require('../services/aiPythonQuotas');
const { watchTrainingUntilSettled } = require('../services/aiPythonWebhooks');
const { recordTrainingRun } = require('./storageIdeasController');
const { health: baseHealth } = require('./production');

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

const startPyTorchTraining = async (req, res) => {
    try {
        const quota = checkTrainQuota(req.user.email);
        if (!quota.allowed) {
            return res.status(429).json({ message: quota.message, quota });
        }

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

        consumeTrainQuota(req.user.email);

        const config = {
            epochs: parsedEpochs,
            lr: parsedLr,
            batchSize: parsedBatch,
            openaiAugment: Boolean(openaiAugment),
            openaiSamplesPerClass: parsedOpenAiPerClass,
        };
        let trainingRunId = null;
        if (req.user?.email && req.app.locals.db) {
            trainingRunId = await recordTrainingRun(
                req.app.locals.db,
                req.user.email,
                config,
                result?.metrics || result || {},
            );
        }

        watchTrainingUntilSettled(req.app, req.user.email, { trainingRunId, config });

        return res.json({
            success: true,
            message: 'PyTorch AI learning initiated',
            config,
            trainingRunId,
            result,
            quota: getQuotaSnapshot(req.user.email).train,
        });
    } catch (err) {
        return res.status(500).json({
            error: 'Failed to start PyTorch training',
            message: err.message,
        });
    }
};

const predictPyTorch = async (req, res) => {
    try {
        const quota = checkPredictQuota(req.user.email);
        if (!quota.allowed) {
            return res.status(429).json({ message: quota.message, quota });
        }

        const { text, slot } = req.body || {};
        if (!text || typeof text !== 'string' || !text.trim()) {
            return res.status(400).json({ message: 'Input text is required for prediction.' });
        }

        const prediction = await aiPythonBridge.predict(text.trim(), slot);
        if (prediction?.error) {
            return res.status(400).json({ message: prediction.error, slot: prediction.slot });
        }

        consumePredictQuota(req.user.email);
        return res.json({ ...prediction, quota: getQuotaSnapshot(req.user.email).predict });
    } catch (err) {
        return res.status(500).json({
            error: 'PyTorch prediction failed',
            message: err.message,
        });
    }
};

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

const getPyTorchQuotas = (req, res) => res.json(getQuotaSnapshot(req.user.email));

const streamPyTorchTraining = async (req, res) => {
    try {
        await aiPythonBridge.ensureServerRunning();
        const upstream = await fetch(`${aiPythonBridge.PYTHON_BASE_URL}/train/stream`);
        if (!upstream.ok) {
            return res.status(502).json({ message: 'Training stream unavailable' });
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();

        req.on('close', () => {
            reader.cancel().catch(() => {});
        });

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(decoder.decode(value, { stream: true }));
        }
        res.end();
    } catch (err) {
        if (!res.headersSent) {
            return res.status(500).json({ message: err.message });
        }
        res.end();
    }
};

const listPyTorchDataset = async (req, res) => {
    try {
        const data = await aiPythonBridge.listDataset();
        return res.json(data);
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

const createPyTorchDatasetSample = async (req, res) => {
    try {
        const { text, label } = req.body || {};
        const result = await aiPythonBridge.addDatasetSample(text, label);
        if (result?.ok === false) {
            return res.status(400).json(result);
        }
        return res.status(201).json(result);
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

const deletePyTorchDatasetSample = async (req, res) => {
    try {
        const index = parseInt(req.params.index, 10);
        const result = await aiPythonBridge.deleteDatasetSample(index);
        if (result?.ok === false) {
            return res.status(400).json(result);
        }
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

const exportPyTorchModel = async (req, res) => {
    try {
        const bundle = await aiPythonBridge.exportModelBundle();
        res.setHeader('Content-Disposition', 'attachment; filename="allmodelai-pytorch-export.json"');
        return res.json(bundle);
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

const importPyTorchModel = async (req, res) => {
    try {
        const bundle = req.body?.bundle || req.body;
        const result = await aiPythonBridge.importModelBundle(bundle);
        if (result?.ok === false) {
            return res.status(400).json(result);
        }
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

const savePyTorchModelSlot = async (req, res) => {
    try {
        const slot = String(req.params.slot || '').toLowerCase();
        const result = await aiPythonBridge.saveModelSlot(slot);
        if (result?.ok === false) {
            return res.status(400).json(result);
        }
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

const getSystemHealth = async (req, res) => {
    const pytorch = await aiPythonBridge.getHealth();
    const pytorchStatus = await aiPythonBridge.getStatus().catch(() => null);

    const mockRes = {
        statusCode: 200,
        payload: {},
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.payload = payload;
            return payload;
        },
    };
    baseHealth(req, mockRes);
    const core = mockRes.payload || {};

    return res.json({
        ...core,
        pytorch: {
            ...pytorch,
            is_training: Boolean(pytorchStatus?.is_training),
            model_file_exists: Boolean(pytorchStatus?.model_file_exists),
            device: pytorchStatus?.device || pytorch.device,
        },
    });
};

module.exports = {
    getPyTorchStatus,
    startPyTorchTraining,
    predictPyTorch,
    resetPyTorchModel,
    getOpenAiTrainingStatus,
    augmentPyTorchDataset,
    getPyTorchQuotas,
    streamPyTorchTraining,
    listPyTorchDataset,
    createPyTorchDatasetSample,
    deletePyTorchDatasetSample,
    exportPyTorchModel,
    importPyTorchModel,
    savePyTorchModelSlot,
    getSystemHealth,
};
