const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Path to allModelAi/ai_python
const PYTHON_DIR = path.resolve(__dirname, '..', '..', '..', 'ai_python');
const MAIN_PY = path.join(PYTHON_DIR, 'main.py');
const PYTHON_PORT = process.env.AI_PYTHON_PORT || 5055;
const PYTHON_BASE_URL = `http://127.0.0.1:${PYTHON_PORT}`;

let serverProcess = null;
let startingPromise = null;

/**
 * Checks if the Python FastAPI server is currently reachable.
 */
async function isServerHealthy() {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1200);
        const res = await fetch(`${PYTHON_BASE_URL}/health`, { signal: controller.signal });
        clearTimeout(timeout);
        return res.ok;
    } catch {
        return false;
    }
}

/**
 * Ensures the Python FastAPI server process is running.
 */
async function ensureServerRunning() {
    if (await isServerHealthy()) {
        return true;
    }

    if (startingPromise) {
        return startingPromise;
    }

    startingPromise = (async () => {
        try {
            console.log(`[aiPythonBridge] Spawning PyTorch AI server on port ${PYTHON_PORT}...`);
            const proc = spawn('py', [MAIN_PY, '--serve', '--port', String(PYTHON_PORT)], {
                cwd: PYTHON_DIR,
                stdio: ['ignore', 'pipe', 'pipe'],
                shell: true,
                detached: false,
            });

            proc.stdout?.on('data', (d) => {
                const text = d.toString().trim();
                if (text) console.log(`[ai_python stdout] ${text}`);
            });

            proc.stderr?.on('data', (d) => {
                const text = d.toString().trim();
                if (text) console.warn(`[ai_python stderr] ${text}`);
            });

            proc.on('close', (code) => {
                console.log(`[aiPythonBridge] Python server exited with code ${code}`);
                serverProcess = null;
            });

            proc.on('error', (err) => {
                console.error('[aiPythonBridge] Python process error:', err.message);
                serverProcess = null;
            });

            serverProcess = proc;

            // Wait up to 6 seconds for server to start
            for (let i = 0; i < 20; i++) {
                await new Promise((r) => setTimeout(r, 300));
                if (await isServerHealthy()) {
                    console.log(`[aiPythonBridge] PyTorch AI server is healthy and responding!`);
                    return true;
                }
            }
        } catch (err) {
            console.error('[aiPythonBridge] Failed to spawn Python server:', err.message);
        } finally {
            startingPromise = null;
        }

        return false;
    })();

    return startingPromise;
}

/**
 * Executes a single-shot JSON command with main.py if HTTP server is not available.
 */
function runSingleShotCmd(action, payload = {}) {
    return new Promise((resolve, reject) => {
        const cmdData = JSON.stringify({ action, ...payload });
        const b64Data = Buffer.from(cmdData, 'utf-8').toString('base64');
        const proc = spawn('py', [MAIN_PY, '--base64-cmd', b64Data], {
            cwd: PYTHON_DIR,
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: true,
        });

        let output = '';
        let errOutput = '';

        proc.stdout.on('data', (chunk) => {
            output += chunk.toString();
        });

        proc.stderr.on('data', (chunk) => {
            errOutput += chunk.toString();
        });

        proc.on('error', (err) => {
            reject(err);
        });

        proc.on('close', (code) => {
            if (code !== 0) {
                return reject(new Error(errOutput || `Python process exited with code ${code}`));
            }
            try {
                // Find JSON in output
                const match = output.match(/\{[\s\S]*\}/);
                if (match) {
                    return resolve(JSON.parse(match[0]));
                }
                resolve({ raw: output.trim() });
            } catch (e) {
                reject(new Error(`Failed to parse Python JSON output: ${output}`));
            }
        });
    });
}

/**
 * Get PyTorch AI status, parameters, and training metrics.
 */
async function getStatus() {
    const isHealthy = await isServerHealthy();
    if (isHealthy) {
        try {
            const res = await fetch(`${PYTHON_BASE_URL}/status`);
            if (res.ok) return await res.json();
        } catch (e) {
            console.warn('[aiPythonBridge] HTTP status fetch failed, falling back to CLI:', e.message);
        }
    }
    return runSingleShotCmd('status');
}

/**
 * Start AI Training.
 */
async function startTraining({ epochs = 60, lr = 0.005, batchSize = 16 } = {}) {
    await ensureServerRunning();
    const isHealthy = await isServerHealthy();
    if (isHealthy) {
        try {
            const res = await fetch(`${PYTHON_BASE_URL}/train`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ epochs, lr, batch_size: batchSize }),
            });
            if (res.ok) return await res.json();
        } catch (e) {
            console.warn('[aiPythonBridge] HTTP train call failed, falling back to CLI:', e.message);
        }
    }
    return runSingleShotCmd('train', { epochs, lr, batchSize });
}

/**
 * Predict / classify input text using the PyTorch neural network.
 */
async function predict(text) {
    if (!text || typeof text !== 'string') {
        throw new Error('Input text is required');
    }

    const isHealthy = await isServerHealthy();
    if (isHealthy) {
        try {
            const res = await fetch(`${PYTHON_BASE_URL}/predict`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
            });
            if (res.ok) return await res.json();
        } catch (e) {
            console.warn('[aiPythonBridge] HTTP predict call failed, falling back to CLI:', e.message);
        }
    }
    return runSingleShotCmd('predict', { text });
}

/**
 * Reset PyTorch model weights.
 */
async function resetModel() {
    const isHealthy = await isServerHealthy();
    if (isHealthy) {
        try {
            const res = await fetch(`${PYTHON_BASE_URL}/reset`, { method: 'POST' });
            if (res.ok) return await res.json();
        } catch {}
    }
    return runSingleShotCmd('reset');
}

module.exports = {
    ensureServerRunning,
    getStatus,
    startTraining,
    predict,
    resetModel,
};
