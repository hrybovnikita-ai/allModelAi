const fs = require('node:fs');
const path = require('node:path');

let loaded = false;

function resolveBackendEnvPath() {
    return process.env.BACKEND_ENV_FILE
        ? path.resolve(process.env.BACKEND_ENV_FILE)
        : path.join(__dirname, '..', '.env');
}

function loadBackendEnv() {
    if (loaded) {
        return;
    }
    const envPath = resolveBackendEnvPath();
    try {
        if (fs.existsSync(envPath)) {
            process.loadEnvFile(envPath);
        }
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
    }
    loaded = true;
}

/** @internal Tests only — allows reloading a different BACKEND_ENV_FILE. */
function resetBackendEnvLoaderForTests() {
    loaded = false;
}

module.exports = {
    loadBackendEnv,
    resetBackendEnvLoaderForTests,
    resolveBackendEnvPath,
};
