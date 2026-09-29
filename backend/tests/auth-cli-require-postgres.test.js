const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
    assertPostgresRequired,
    parseAuthCliArgs,
} = require('../scripts/auth-cli');
const { resetBackendEnvLoaderForTests } = require('../scripts/load-backend-env');

const backendRoot = path.join(__dirname, '..');
const checkScript = path.join(backendRoot, 'scripts', 'auth-check-user.js');
const verifyScript = path.join(backendRoot, 'scripts', 'auth-verify-password.js');

let isolatedEnvFile = null;

beforeEach(() => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'allmodelai-auth-cli-'));
    isolatedEnvFile = path.join(tempDir, '.env');
    fs.writeFileSync(isolatedEnvFile, '# isolated test env — no DATABASE_URL\n', 'utf8');
    process.env.BACKEND_ENV_FILE = isolatedEnvFile;
    resetBackendEnvLoaderForTests();
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.POSTGRES_CONNECTION_STRING;
    delete process.env.SUPABASE_DATABASE_URL;
    delete require.cache[require.resolve('../src/db/provider')];
});

afterEach(() => {
    delete process.env.BACKEND_ENV_FILE;
    resetBackendEnvLoaderForTests();
    if (isolatedEnvFile) {
        fs.rmSync(path.dirname(isolatedEnvFile), { recursive: true, force: true });
        isolatedEnvFile = null;
    }
    delete require.cache[require.resolve('../src/db/provider')];
});

test('parseAuthCliArgs detects --require-postgres', () => {
    const args = parseAuthCliArgs(['--email="user@test.com"', '--require-postgres']);
    assert.equal(args.email, 'user@test.com');
    assert.equal(args.requirePostgres, true);
});

test('assertPostgresRequired exits when postgres is not configured', () => {
    const originalExit = process.exit;
    let exitCode = null;
    process.exit = (code) => {
        exitCode = code;
        throw new Error('process.exit called');
    };

    try {
        assert.throws(() => assertPostgresRequired(true), /process.exit called/);
        assert.equal(exitCode, 1);
    } finally {
        process.exit = originalExit;
    }
});

test('auth:check-user --require-postgres refuses SQLite fallback', () => {
    const env = {
        ...process.env,
        BACKEND_ENV_FILE: isolatedEnvFile,
        NODE_ENV: 'development',
    };
    delete env.DATABASE_URL;
    delete env.POSTGRES_URL;
    delete env.POSTGRES_CONNECTION_STRING;
    delete env.SUPABASE_DATABASE_URL;

    let stderr = '';
    try {
        execFileSync(process.execPath, [
            checkScript,
            '--email=user@test.com',
            '--require-postgres',
        ], {
            cwd: backendRoot,
            env,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        assert.fail('Expected non-zero exit');
    } catch (error) {
        stderr = error.stderr || '';
        assert.notEqual(error.status, 0);
        assert.match(stderr, /PostgreSQL required but not configured/);
    }
});

test('auth:verify-password --require-postgres refuses SQLite fallback', () => {
    const env = {
        ...process.env,
        BACKEND_ENV_FILE: isolatedEnvFile,
        NODE_ENV: 'development',
    };
    delete env.DATABASE_URL;
    delete env.POSTGRES_URL;

    try {
        execFileSync(process.execPath, [
            verifyScript,
            '--email=user@test.com',
            '--require-postgres',
        ], {
            cwd: backendRoot,
            env,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        assert.fail('Expected non-zero exit');
    } catch (error) {
        assert.notEqual(error.status, 0);
        assert.match(String(error.stderr || ''), /PostgreSQL required but not configured/);
    }
});

test('auth:check-user output never includes password hash material', () => {
    const env = {
        ...process.env,
        BACKEND_ENV_FILE: isolatedEnvFile,
        NODE_ENV: 'development',
    };
    delete env.DATABASE_URL;
    let stdout = '';
    try {
        stdout = execFileSync(process.execPath, [
            checkScript,
            '--email=nobody@example.com',
        ], {
            cwd: backendRoot,
            env,
            encoding: 'utf8',
        });
    } catch {
        return;
    }
    assert.doesNotMatch(stdout, /salt:/);
    assert.doesNotMatch(stdout, /postgresql:\/\//);
});
