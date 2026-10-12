const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

test('run-all.js executes each test file in isolation with START/END logging and timeouts', () => {
    const source = readFileSync(path.join(__dirname, 'run-all.js'), 'utf8');
    assert.match(source, /\[backend-tests\] START/);
    assert.match(source, /\[backend-tests\] END/);
    assert.match(source, /timeout:\s*FILE_TIMEOUT_MS/);
    assert.doesNotMatch(source, /experimental-test-isolation=process/);
});

test('aiPythonBridge exposes shutdown and bounded fetch for CI teardown', () => {
    const bridge = require('../src/services/aiPythonBridge');
    assert.equal(typeof bridge.shutdownPythonServer, 'function');
    assert.equal(typeof bridge.fetchPython, 'function');
    assert.ok(Number(bridge.PYTHON_FETCH_TIMEOUT_MS) >= 2000);
});
