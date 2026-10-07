/**
 * Proxies authenticated server requests to the Python FastAPI LLM layer (/llm/*).
 * Does not replace Node createChatResponse — opt-in for tooling and future routing.
 */

const { ensureServerRunning, isServerHealthy, PYTHON_BASE_URL } = require('./aiPythonBridge');

async function postJson(path, body) {
    await ensureServerRunning();
    const healthy = await isServerHealthy();
    if (!healthy) {
        const err = new Error('Python AI service is not running');
        err.code = 'PYTHON_SERVICE_DOWN';
        throw err;
    }
    const res = await fetch(`${PYTHON_BASE_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok && data.ok !== false) {
        const err = new Error(data.message || `Python LLM request failed (${res.status})`);
        err.code = data.code || 'PROVIDER_UNAVAILABLE';
        err.status = res.status;
        throw err;
    }
    return data;
}

async function getJson(path) {
    await ensureServerRunning();
    const res = await fetch(`${PYTHON_BASE_URL}${path}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
        throw new Error(`Python LLM request failed (${res.status})`);
    }
    return res.json();
}

async function getLlmHealth() {
    try {
        return await getJson('/llm/health');
    } catch {
        return { status: 'down', service: 'allmodelai_python_llm' };
    }
}

async function listLlmModels() {
    return getJson('/llm/models');
}

async function chatViaPython(payload) {
    const data = await postJson('/llm/chat', payload);
    if (data.ok === false) {
        const err = new Error(data.message || 'LLM request failed');
        err.code = data.code || 'PROVIDER_UNAVAILABLE';
        throw err;
    }
    return data;
}

module.exports = {
    getLlmHealth,
    listLlmModels,
    chatViaPython,
};
