'use strict';

const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const testsDir = path.join(__dirname, '..', 'tests');
const backendRoot = path.join(testsDir, '..');
const preload = path.join(testsDir, 'test-preload.js');
const manifestPath = path.join(backendRoot, '..', 'qa', 'critical-backend.tests.json');

const FILE_TIMEOUT_MS = Math.max(
    60_000,
    parseInt(process.env.BACKEND_TEST_FILE_TIMEOUT_MS || String(10 * 60 * 1000), 10),
);

/** @type {{ files: string[] }} */
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const testFiles = manifest.files.map((name) => path.join(testsDir, name));

console.log(
    `[backend-tests:critical] Running ${testFiles.length} files ` +
    `(per-file timeout ${FILE_TIMEOUT_MS}ms)`,
);

/** @type {{ label: string; reason: string; durationMs: number }[]} */
const failures = [];
/** @type {{ label: string; durationMs: number }[]} */
const passed = [];

for (const file of testFiles) {
    const label = path.basename(file);
    const started = Date.now();
    console.log(`[backend-tests:critical] START ${label}`);

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
    if (child.status === 0) {
        console.log(`[backend-tests:critical] PASS ${label} (${durationMs}ms)`);
        passed.push({ label, durationMs });
    } else {
        const reason =
            child.error?.message ||
            (child.stderr && String(child.stderr).trim().slice(0, 500)) ||
            `exit ${child.status ?? 'unknown'}`;
        console.error(`[backend-tests:critical] FAIL ${label} (${durationMs}ms): ${reason}`);
        failures.push({ label, reason, durationMs });
    }
}

console.log('[backend-tests:critical] === Summary ===');
console.log(`passed=${passed.length} failed=${failures.length}`);

const reportDir = path.join(backendRoot, '..', 'qa-reports');
const reportPath = path.join(reportDir, 'backend-critical.json');
try {
    const { mkdirSync, writeFileSync } = require('node:fs');
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(
        reportPath,
        `${JSON.stringify({
            total: passed.length + failures.length,
            passed: passed.length,
            failed: failures.length,
            skipped: 0,
            status: failures.length ? 'failed' : 'passed',
            failureLabels: failures.map((f) => f.label),
        })}\n`,
        'utf8',
    );
} catch (err) {
    console.warn(`[backend-tests:critical] Could not write ${reportPath}: ${err.message}`);
}

if (failures.length) {
    for (const f of failures) {
        console.error(`  FAIL ${f.label}: ${f.reason}`);
    }
    process.exit(1);
}
