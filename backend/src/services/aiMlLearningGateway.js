const aiPythonBridge = require('./aiPythonBridge');

const TIMEOUT_MS = Math.max(
    5000,
    parseInt(process.env.AI_ML_LEARNING_TIMEOUT_MS || '45000', 10),
);

async function proxyGet(path, query = '') {
    await aiPythonBridge.ensureServerRunning();
    const url = `${aiPythonBridge.PYTHON_BASE_URL}${path}${query ? `?${query}` : ''}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(url, { signal: controller.signal });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(data.detail || data.error || data.message || 'Python AI request failed');
            err.status = res.status;
            throw err;
        }
        return data;
    } finally {
        clearTimeout(timer);
    }
}

async function proxyPost(path, body) {
    await aiPythonBridge.ensureServerRunning();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(`${aiPythonBridge.PYTHON_BASE_URL}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {}),
            signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(data.detail || data.error || data.message || 'Python AI request failed');
            err.status = res.status;
            throw err;
        }
        return data;
    } finally {
        clearTimeout(timer);
    }
}

module.exports = {
    proxyGet,
    proxyPost,
};
