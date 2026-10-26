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

/** @type {{ label: string; reason: string; durationMs: number }[]} */
const failures = [];
/** @type {{ label: string; durationMs: number }[]} */
const passed = [];

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
            encoding: 'utf8',
            env: process.env,
            timeout: FILE_TIMEOUT_MS,
            killSignal: 'SIGTERM',
        },
    );

    const durationMs = Date.now() - started;
    const stdout = child.stdout || '';
    const stderr = child.stderr || '';
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);

    if (child.error) {
        const reason = child.error.message;
        console.error(`[backend-tests] ERROR ${label}: ${reason}`);
        failures.push({ label, reason, durationMs });
    } else if (child.signal) {
        const reason = `signal=${child.signal} after ${durationMs}ms (timeout ${FILE_TIMEOUT_MS}ms)`;
        console.error(`[backend-tests] TIMEOUT ${label} ${reason}`);
        failures.push({ label, reason, durationMs });
    } else if (child.status !== 0) {
        const reason = `exit=${child.status} duration=${durationMs}ms`;
        console.error(`[backend-tests] FAIL ${label} ${reason}`);
        const tail = `${stdout}\n${stderr}`.trim().split(/\r?\n/).slice(-40).join('\n');
        if (tail) {
            console.error(`[backend-tests] FAIL ${label} — last output lines:\n${tail}`);
        }
        failures.push({ label, reason, durationMs });
    } else {
        console.log(`[backend-tests] PASS ${label} duration=${durationMs}ms`);
        passed.push({ label, durationMs });
    }
}

console.log('[backend-tests] === Summary ===');
console.log(`[backend-tests] passed: ${passed.length}/${testFiles.length}`);
if (failures.length) {
    console.error(`[backend-tests] failed: ${failures.length}/${testFiles.length}`);
    for (const item of failures) {
        console.error(`[backend-tests]   ✗ ${item.label} — ${item.reason}`);
    }
    console.error('[backend-tests] Suite failed.');
    process.exit(1);
}

console.log('[backend-tests] Suite passed.');
