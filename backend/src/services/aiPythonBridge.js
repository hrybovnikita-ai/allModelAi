const { spawn } = require('child_process');
const path = require('path');


const PYTHON_BIN =
    process.env.PYTHON_BIN ||
    (process.platform === 'win32' ? 'py' : 'python3');

// Path to AllModelAi/ai_python
const PYTHON_DIR = path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    'ai_python'
);

const MAIN_PY = path.join(PYTHON_DIR, 'main.py');

const PYTHON_PORT =
    process.env.AI_PYTHON_PORT || 5055;

const PYTHON_BASE_URL =
    `http://127.0.0.1:${PYTHON_PORT}`;

let serverProcess = null;
let startingPromise = null;

/**
 * Checks if the Python FastAPI server is currently reachable.
 */
async function isServerHealthy() {
    try {
        const controller = new AbortController();

        const timeout = setTimeout(() => {
            controller.abort();
        }, 1200);

        const res = await fetch(
            `${PYTHON_BASE_URL}/health`,
            {
                signal: controller.signal,
            }
        );

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
            console.log(
                `[aiPythonBridge] Spawning PyTorch AI server with ${PYTHON_BIN} on port ${PYTHON_PORT}...`
            );

            const proc = spawn(
                PYTHON_BIN,
                [
                    MAIN_PY,
                    '--serve',
                    '--port',
                    String(PYTHON_PORT),
                ],
                {
                    cwd: PYTHON_DIR,
                    stdio: [
                        'ignore',
                        'pipe',
                        'pipe',
                    ],
                    detached: false,
                }
            );

            proc.stdout?.on('data', (data) => {
                const text =
                    data.toString().trim();

                if (text) {
                    console.log(
                        `[ai_python stdout] ${text}`
                    );
                }
            });

            proc.stderr?.on('data', (data) => {
                const text =
                    data.toString().trim();

                if (text) {
                    console.warn(
                        `[ai_python stderr] ${text}`
                    );
                }
            });

            proc.on('close', (code) => {
                console.log(
                    `[aiPythonBridge] Python server exited with code ${code}`
                );

                serverProcess = null;
            });

            proc.on('error', (err) => {
                console.error(
                    '[aiPythonBridge] Python process error:',
                    err.message
                );

                serverProcess = null;
            });

            serverProcess = proc;

            // Wait up to ~6 seconds
            for (let i = 0; i < 20; i++) {
                await new Promise((resolve) => {
                    setTimeout(resolve, 300);
                });

                if (await isServerHealthy()) {
                    console.log(
                        '[aiPythonBridge] PyTorch AI server is healthy and responding!'
                    );

                    return true;
                }
            }

            console.warn(
                '[aiPythonBridge] Python server did not become healthy in time.'
            );
        } catch (err) {
            console.error(
                '[aiPythonBridge] Failed to spawn Python server:',
                err.message
            );
        } finally {
            startingPromise = null;
        }

        return false;
    })();

    return startingPromise;
}

/**
 * Executes a single-shot JSON command
 * with main.py if HTTP server is unavailable.
 */
function runSingleShotCmd(action, payload = {}) {
    return new Promise((resolve, reject) => {
        const cmdData = JSON.stringify({
            action,
            ...payload,
        });

        const b64Data = Buffer.from(
            cmdData,
            'utf-8'
        ).toString('base64');

        const proc = spawn(
            PYTHON_BIN,
            [
                MAIN_PY,
                '--base64-cmd',
                b64Data,
            ],
            {
                cwd: PYTHON_DIR,
                stdio: [
                    'ignore',
                    'pipe',
                    'pipe',
                ],
            }
        );

        let output = '';
        let errOutput = '';

        proc.stdout.on('data', (chunk) => {
            output += chunk.toString();
        });

        proc.stderr.on('data', (chunk) => {
            errOutput += chunk.toString();
        });

        proc.on('error', (err) => {
            reject(
                new Error(
                    `Unable to start ${PYTHON_BIN}: ${err.message}`
                )
            );
        });

        proc.on('close', (code) => {
            if (code !== 0) {
                return reject(
                    new Error(
                        errOutput ||
                        `Python process exited with code ${code}`
                    )
                );
            }

            try {
                const match =
                    output.match(/\{[\s\S]*\}/);

                if (match) {
                    return resolve(
                        JSON.parse(match[0])
                    );
                }

                return resolve({
                    raw: output.trim(),
                });
            } catch {
                return reject(
                    new Error(
                        `Failed to parse Python JSON output: ${output}`
                    )
                );
            }
        });
    });
}

/**
 * Get PyTorch AI status.
 */
async function getStatus() {
    let healthy = await isServerHealthy();

    if (!healthy) {
        await ensureServerRunning();
        healthy = await isServerHealthy();
    }

    if (healthy) {
        try {
            const res = await fetch(
                `${PYTHON_BASE_URL}/status`
            );

            if (res.ok) {
                return await res.json();
            }
        } catch (err) {
            console.warn(
                '[aiPythonBridge] HTTP status failed, using CLI:',
                err.message
            );
        }
    }

    return runSingleShotCmd('status');
}

/**
 * Start AI training.
 */
async function getOpenAiStatus() {
    const healthy = await isServerHealthy();

    if (healthy) {
        try {
            const res = await fetch(`${PYTHON_BASE_URL}/openai/status`);
            if (res.ok) {
                return await res.json();
            }
        } catch (err) {
            console.warn(
                '[aiPythonBridge] HTTP openai status failed, using CLI:',
                err.message
            );
        }
    }

    return runSingleShotCmd('openai_status');
}

async function augmentWithOpenAi({ samplesPerClass = 2 } = {}) {
    await ensureServerRunning();

    const healthy = await isServerHealthy();

    if (healthy) {
        try {
            const res = await fetch(`${PYTHON_BASE_URL}/openai/augment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ samples_per_class: samplesPerClass }),
            });

            if (res.ok) {
                return await res.json();
            }
        } catch (err) {
            console.warn(
                '[aiPythonBridge] HTTP openai augment failed, using CLI:',
                err.message
            );
        }
    }

    return runSingleShotCmd('openai_augment', { samplesPerClass });
}

async function startTraining({
    epochs = 60,
    lr = 0.005,
    batchSize = 16,
    openaiAugment = false,
    openaiSamplesPerClass = 2,
} = {}) {
    await ensureServerRunning();

    const healthy =
        await isServerHealthy();

    if (healthy) {
        try {
            const res = await fetch(
                `${PYTHON_BASE_URL}/train`,
                {
                    method: 'POST',

                    headers: {
                        'Content-Type':
                            'application/json',
                    },

                    body: JSON.stringify({
                        epochs,
                        lr,
                        batch_size: batchSize,
                        openai_augment: openaiAugment,
                        openai_samples_per_class: openaiSamplesPerClass,
                    }),
                }
            );

            if (res.ok) {
                return await res.json();
            }
        } catch (err) {
            console.warn(
                '[aiPythonBridge] HTTP train failed, using CLI:',
                err.message
            );
        }
    }

    return runSingleShotCmd('train', {
        epochs,
        lr,
        batchSize,
        openaiAugment,
        openaiSamplesPerClass,
    });
}

/**
 * Predict text.
 */
async function fetchJson(path, options = {}) {
    await ensureServerRunning();
    const healthy = await isServerHealthy();
    if (!healthy) {
        throw new Error('PyTorch AI server is unavailable');
    }
    const res = await fetch(`${PYTHON_BASE_URL}${path}`, options);
    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `PyTorch request failed (${res.status})`);
    }
    return res.json();
}

async function getHealth() {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1500);
        const res = await fetch(`${PYTHON_BASE_URL}/health`, { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) return res.json();
    } catch {
        /* fall through */
    }
    return { status: 'down', service: 'pytorch_ai_service' };
}

async function predict(text, slot) {
    if (
        !text ||
        typeof text !== 'string'
    ) {
        throw new Error(
            'Input text is required'
        );
    }

    const healthy =
        await isServerHealthy();

    if (healthy) {
        try {
            const res = await fetch(
                `${PYTHON_BASE_URL}/predict`,
                {
                    method: 'POST',

                    headers: {
                        'Content-Type':
                            'application/json',
                    },

                    body: JSON.stringify({
                        text,
                        slot: slot || null,
                    }),
                }
            );

            if (res.ok) {
                return await res.json();
            }
        } catch (err) {
            console.warn(
                '[aiPythonBridge] HTTP predict failed, using CLI:',
                err.message
            );
        }
    }

    return runSingleShotCmd(
        'predict',
        {
            text,
            slot,
        }
    );
}

async function listDataset() {
    try {
        return await fetchJson('/dataset');
    } catch {
        return { samples: [], total: 0 };
    }
}

async function addDatasetSample(text, label) {
    return fetchJson('/dataset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, label }),
    });
}

async function deleteDatasetSample(index) {
    return fetchJson(`/dataset/${index}`, { method: 'DELETE' });
}

async function exportModelBundle() {
    return fetchJson('/export');
}

async function importModelBundle(bundle) {
    return fetchJson('/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle }),
    });
}

async function saveModelSlot(slotId) {
    return fetchJson(`/models/slot/${slotId}`, { method: 'POST' });
}

async function getTrainStreamUrl() {
    await ensureServerRunning();
    return `${PYTHON_BASE_URL}/train/stream`;
}

/**
 * Reset PyTorch model weights.
 */
async function resetModel() {
    const healthy =
        await isServerHealthy();

    if (healthy) {
        try {
            const res = await fetch(
                `${PYTHON_BASE_URL}/reset`,
                {
                    method: 'POST',
                }
            );

            if (res.ok) {
                return await res.json();
            }
        } catch (err) {
            console.warn(
                '[aiPythonBridge] HTTP reset failed, using CLI:',
                err.message
            );
        }
    }

    return runSingleShotCmd('reset');
}

async function runLabCommand(action, payload = {}) {
    const cmdPayload = {
        action,
        learningRate: payload.learning_rate ?? payload.learningRate,
        learning_rate: payload.learning_rate ?? payload.learningRate,
        epochs: payload.epochs,
        initialWeight: payload.initial_weight ?? payload.initialWeight,
        initial_weight: payload.initial_weight ?? payload.initialWeight,
        initialBias: payload.initial_bias ?? payload.initialBias,
        initial_bias: payload.initial_bias ?? payload.initialBias,
        seed: payload.seed,
        dataPoints: payload.data_points ?? payload.dataPoints,
        data_points: payload.data_points ?? payload.dataPoints,
        snapshotEvery: payload.snapshot_every ?? payload.snapshotEvery,
        snapshot_every: payload.snapshot_every ?? payload.snapshotEvery,
    };
    return runSingleShotCmd(action, cmdPayload);
}

module.exports = {
    ensureServerRunning,
    isServerHealthy,
    getHealth,
    getStatus,
    getOpenAiStatus,
    augmentWithOpenAi,
    startTraining,
    predict,
    resetModel,
    listDataset,
    addDatasetSample,
    deleteDatasetSample,
    exportModelBundle,
    importModelBundle,
    saveModelSlot,
    getTrainStreamUrl,
    runLabCommand,
    runSingleShotCmd,
    PYTHON_BASE_URL,
};