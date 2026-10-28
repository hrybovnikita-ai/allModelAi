const { test } = require('node:test');
const assert = require('node:assert/strict');
const studio = require('../src/platform/studioFeatures');

test('bug logs are sanitized and status cannot skip ahead', () => {
    studio.clearStudioForTests();
    const bug = studio.createBug('ada@example.com', { title: 'Login loop', log: 'Authorization: Bearer sk-supersecretvalue' });
    assert.equal(bug.log.includes('sk-supersecretvalue'), false);
    assert.throws(() => studio.updateBugStatus('ada@example.com', bug.id, 'resolved'), /one step/);
    assert.equal(studio.updateBugStatus('ada@example.com', bug.id, 'investigating').status, 'investigating');
});

test('scheduled tasks are claimed once', () => {
    studio.clearStudioForTests();
    const task = studio.createSchedule('ada@example.com', { name: 'Daily', recurrence: 'daily', nextRunAt: new Date(Date.now() - 1000).toISOString() });
    const first = studio.claimDueTask('ada@example.com');
    const second = studio.claimDueTask('ada@example.com');
    assert.equal(first.id, task.id);
    assert.equal(second, null);
});

test('datasets, tools, json, and evidence stay bounded', () => {
    studio.clearStudioForTests();
    const report = studio.analyzeCsv('ada@example.com', { name: 'scores.csv', text: 'name,score\nAda,9\n' });
    assert.equal(report.rowCount, 1);
    assert.throws(() => studio.analyzeCsv('ada@example.com', { name: 'book.xlsx', text: 'x' }), /XLSX/);
    assert.equal(studio.callTool({ name: 'calculator', args: { a: 2, b: 3 } }).output, 5);
    assert.throws(() => studio.callTool({ name: 'write_file' }), /confirmation/);
    assert.equal(studio.validateStructured('{"name":"Ada"}', { required: ['name'] }).valid, true);
    assert.equal(studio.validateStructured('{', { required: ['name'] }).valid, false);
    const checked = studio.checkEvidence(['Ada scored 9'], [{ id: 'p1', text: 'Ada scored 9 on the quiz' }]);
    assert.equal(checked[0].status, 'supported');
    assert.equal(studio.checkEvidence(['unknown fact'], [{ id: 'p1', text: 'Ada scored 9' }])[0].status, 'insufficient_evidence');
});
