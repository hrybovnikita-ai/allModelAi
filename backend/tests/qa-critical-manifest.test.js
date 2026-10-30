const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const path = require('node:path');

const testsDir = __dirname;
const manifest = JSON.parse(
    readFileSync(path.join(testsDir, '..', '..', 'qa', 'critical-backend.tests.json'), 'utf8'),
);

test('critical backend manifest lists existing test files', () => {
    assert.ok(Array.isArray(manifest.files) && manifest.files.length > 0);
    for (const name of manifest.files) {
        assert.match(name, /\.test\.js$/);
        const filePath = path.join(testsDir, name);
        assert.ok(existsSync(filePath), `missing critical test: ${name}`);
    }
});
