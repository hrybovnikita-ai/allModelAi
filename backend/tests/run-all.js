'use strict';

const { spawnSync } = require('node:child_process');
const { readdirSync } = require('node:fs');
const path = require('node:path');

const testsDir = __dirname;
const backendRoot = path.join(testsDir, '..');
const testFiles = readdirSync(testsDir)
    .filter((name) => name.endsWith('.test.js'))
    .sort()
    .map((name) => path.join(testsDir, name));

if (!testFiles.length) {
    console.error('No backend test files found.');
    process.exit(1);
}

const child = spawnSync(
    process.execPath,
    [
        '--require',
        path.join(testsDir, 'test-preload.js'),
        '--experimental-test-isolation=process',
        '--test-concurrency=1',
        '--test',
        ...testFiles,
    ],
    {
        cwd: backendRoot,
        stdio: 'inherit',
        env: process.env,
    },
);

if (child.error) {
    console.error(child.error.message);
    process.exit(1);
}

process.exit(child.status === null ? 1 : child.status);
