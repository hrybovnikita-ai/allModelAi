const { getLlmHealth, listLlmModels, chatViaPython } = require('../services/pythonLlmBridge');

const getPythonLlmHealth = async (_req, res) => {
    const health = await getLlmHealth();
    return res.json(health);
};

const getPythonLlmModels = async (_req, res) => {
    try {
        const models = await listLlmModels();
        return res.json(models);
    } catch (error) {
        return res.status(503).json({
            message: 'Python LLM service is unavailable.',
            code: error.code || 'PYTHON_SERVICE_DOWN',
        });
    }
};

const postPythonLlmChat = async (req, res) => {
    const { provider, model, messages, prompt, system, temperature, max_tokens, stream, smart } = req.body || {};
    if (!smart && !provider) {
        return res.status(400).json({ message: 'provider is required unless smart=true', code: 'INVALID_PROVIDER' });
    }
    if (!smart && !model) {
        return res.status(400).json({ message: 'model is required unless smart=true', code: 'INVALID_MODEL' });
    }
    try {
        const result = await chatViaPython({
            provider,
            model,
            messages: Array.isArray(messages) ? messages : [],
            prompt,
            system,
            temperature,
            max_tokens,
            stream: Boolean(stream),
            smart: Boolean(smart),
        });
        return res.json(result);
    } catch (error) {
        const status = error.code === 'MISSING_API_KEY' ? 503 : 502;
        return res.status(status).json({
            message: error.message || 'LLM request failed',
            code: error.code || 'PROVIDER_UNAVAILABLE',
        });
    }
};

module.exports = {
    getPythonLlmHealth,
    getPythonLlmModels,
    postPythonLlmChat,
};
