const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after } = require('node:test');

process.env.NODE_ENV = 'test';

if (process.env.ALLOW_POSTGRES_TESTS !== 'true') {
    delete process.env.DATABASE_URL;
}

if (!process.env.DB_FILE) {
    process.env.DB_FILE = path.join(
        os.tmpdir(),
        `allmodelai-test-${process.pid}-${Date.now()}.sqlite`,
    );
}

const resolved = path.isAbsolute(process.env.DB_FILE)
    ? process.env.DB_FILE
    : path.resolve(__dirname, '..', process.env.DB_FILE);

try {
    fs.rmSync(resolved, { force: true });
} catch {
    /* ignore */
}

function cleanupTestArtifactsSync() {
    try {
        fs.rmSync(resolved, { force: true });
    } catch {
        /* ignore */
    }
}

async function cleanupPythonBridgeAsync() {
    try {
        const { shutdownPythonServerAsync } = require('../src/services/aiPythonBridge');
        await shutdownPythonServerAsync();
    } catch {
        /* bridge not loaded in this process */
    }
}

after(async () => {
    await cleanupPythonBridgeAsync();
    cleanupTestArtifactsSync();
});

process.on('exit', cleanupTestArtifactsSync);
process.on('SIGINT', () => {
    void cleanupPythonBridgeAsync().finally(() => {
        cleanupTestArtifactsSync();
        process.exit(130);
    });
});
process.on('SIGTERM', () => {
    void cleanupPythonBridgeAsync().finally(() => {
        cleanupTestArtifactsSync();
        process.exit(143);
    });
});
