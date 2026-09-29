const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('sqlite import dry-run reports production-worthy users without DATABASE_URL', () => {
    const script = path.join(__dirname, '..', 'scripts', 'import-sqlite.js');
    const output = execFileSync(process.execPath, [script, '--dry-run'], {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf8',
    });
    const report = JSON.parse(output);
    assert.equal(report.mode, 'dry-run');
    assert.equal(report.totals.usersInSqlite, 944);
    assert.ok(report.totals.usersSelected >= 10);
    assert.ok(report.totals.usersSelected <= 15);
    assert.ok(report.selectedEmails.includes('hrybovnikita@gmail.com'));
    assert.equal(report.userBuckets.test_example_domain, 929);
});
