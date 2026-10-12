'use strict';

const { spawnSync } = require('node:child_process');
const { readdirSync } = require('node:fs');
const path = require('node:path');

const testsDir = __dirname;
const backendRoot = path.join(testsDir, '..');
const preload = path.join(testsDir, 'test-preload.js');

const FILE_TIMEOUT_MS = Math.max(
    60_000,
    parseInt(process.env.BACKEND_TEST_FILE_TIMEOUT_MS || String(10 * 60 * 1000), 10),
);

const testFiles = readdirSync(testsDir)
    .filter((name) => name.endsWith('.test.js'))
    .sort()
    .map((name) => path.join(testsDir, name));

if (!testFiles.length) {
    console.error('No backend test files found.');
    process.exit(1);
}

console.log(
    `[backend-tests] Running ${testFiles.length} files ` +
    `(per-file timeout ${FILE_TIMEOUT_MS}ms)`,
);

let failed = false;

for (const file of testFiles) {
    const label = path.basename(file);
    const started = Date.now();
    console.log(`[backend-tests] START ${label}`);

    const child = spawnSync(
        process.execPath,
        [
            '--require',
            preload,
            '--test-concurrency=1',
            '--test-force-exit',
            '--test',
            file,
        ],
        {
            cwd: backendRoot,
            stdio: 'inherit',
            env: process.env,
            timeout: FILE_TIMEOUT_MS,
            killSignal: 'SIGTERM',
        },
    );

    const durationMs = Date.now() - started;

    if (child.error) {
        console.error(`[backend-tests] ERROR ${label}: ${child.error.message}`);
        failed = true;
    } else if (child.signal) {
        console.error(
            `[backend-tests] TIMEOUT ${label} signal=${child.signal} after ${durationMs}ms`,
        );
        failed = true;
    } else if (child.status !== 0) {
        console.error(
            `[backend-tests] FAIL ${label} exit=${child.status} duration=${durationMs}ms`,
        );
        failed = true;
    } else {
        console.log(`[backend-tests] END ${label} ok duration=${durationMs}ms`);
    }
}

if (failed) {
    console.error('[backend-tests] Suite failed.');
    process.exit(1);
}

console.log('[backend-tests] Suite passed.');
