const aiPythonBridge = require('./aiPythonBridge');

const LAB_TIMEOUT_MS = Math.max(
    5000,
    parseInt(process.env.AI_TRAINING_TIMEOUT_MS || '45000', 10),
);

let activeLabJobs = 0;
const MAX_CONCURRENT_LAB_JOBS = Math.max(
    1,
    parseInt(process.env.AI_TRAINING_MAX_CONCURRENT || '3', 10),
);

async function postLab(path, payload) {
    if (activeLabJobs >= MAX_CONCURRENT_LAB_JOBS) {
        const err = new Error('AI Training lab is busy. Try again in a moment.');
        err.status = 429;
        throw err;
    }

    activeLabJobs += 1;
    try {
        await aiPythonBridge.ensureServerRunning();
        const healthy = await aiPythonBridge.isServerHealthy();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), LAB_TIMEOUT_MS);

        if (healthy) {
            try {
                const res = await fetch(`${aiPythonBridge.PYTHON_BASE_URL}${path}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: controller.signal,
                });
                clearTimeout(timer);
                const data = await res.json().catch(() => ({}));
                if (res.ok) {
                    return data;
                }
                if (res.status !== 404) {
                    const err = new Error(data.error || data.message || 'Python lab request failed');
                    err.status = res.status;
                    throw err;
                }
                // Stale FastAPI process may lack /labs routes — fall back to one-shot CLI below.
            } catch (error) {
                clearTimeout(timer);
                if (error.name === 'AbortError') {
                    const err = new Error('Training timed out');
                    err.status = 504;
                    throw err;
                }
                if (error.status) {
                    throw error;
                }
                // Network / spawn issues — fall through to one-shot CLI below.
            }
        } else {
            clearTimeout(timer);
        }

        const actionMap = {
            '/labs/linear-regression/train': 'lab_linear_regression_train',
            '/labs/gradient-descent/train': 'lab_gradient_descent_train',
            '/labs/pytorch/train': 'lab_pytorch_train',
        };
        const action = actionMap[path];
        if (!action) {
            const err = new Error('Unknown lab path');
            err.status = 400;
            throw err;
        }
        return aiPythonBridge.runLabCommand(action, payload);
    } finally {
        activeLabJobs -= 1;
    }
}

async function getLessonsCatalog() {
    await aiPythonBridge.ensureServerRunning();
    if (await aiPythonBridge.isServerHealthy()) {
        const res = await fetch(`${aiPythonBridge.PYTHON_BASE_URL}/labs/lessons`);
        if (res.ok) {
            return res.json();
        }
    }
    return aiPythonBridge.runLabCommand('labs_lessons', {});
}

async function getLessonDetail(lessonId) {
    await aiPythonBridge.ensureServerRunning();
    if (await aiPythonBridge.isServerHealthy()) {
        const res = await fetch(`${aiPythonBridge.PYTHON_BASE_URL}/labs/lessons/${encodeURIComponent(lessonId)}`);
        if (res.status === 404) {
            return { ok: false, error: 'Lesson not found' };
        }
        if (res.ok) {
            return res.json();
        }
    }
    const catalog = await aiPythonBridge.runLabCommand('labs_lessons', {});
    const lesson = (catalog.lessons || []).find((item) => item.id === lessonId);
    if (!lesson) {
        return { ok: false, error: 'Lesson not found' };
    }
    return { ok: true, lesson };
}

module.exports = {
    postLab,
    getLessonsCatalog,
    getLessonDetail,
    LAB_TIMEOUT_MS,
    MAX_CONCURRENT_LAB_JOBS,
};
