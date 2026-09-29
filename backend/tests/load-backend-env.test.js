const { test, after } = require('node:test');
const { resetBackendEnvLoaderForTests } = require('../scripts/load-backend-env');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let tempEnvFile = null;

after(() => {
    delete process.env.BACKEND_ENV_FILE;
    delete process.env.DATABASE_URL;
    resetBackendEnvLoaderForTests();
    if (tempEnvFile) {
        fs.rmSync(path.dirname(tempEnvFile), { recursive: true, force: true });
    }
    delete require.cache[require.resolve('../scripts/load-backend-env')];
    delete require.cache[require.resolve('../src/db/provider')];
});

test('loadBackendEnv loads DATABASE_URL before provider selection', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'allmodelai-env-load-'));
    tempEnvFile = path.join(tempDir, 'test.env');
    fs.writeFileSync(
        tempEnvFile,
        'DATABASE_URL=postgresql://user:secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres\n',
        'utf8',
    );

    process.env.BACKEND_ENV_FILE = tempEnvFile;
    delete process.env.DATABASE_URL;
    delete require.cache[require.resolve('../scripts/load-backend-env')];
    delete require.cache[require.resolve('../src/db/provider')];

    const { loadBackendEnv } = require('../scripts/load-backend-env');
    loadBackendEnv();
    const { getDatabaseEngine } = require('../src/db/provider');
    assert.equal(getDatabaseEngine(), 'postgres');
});
