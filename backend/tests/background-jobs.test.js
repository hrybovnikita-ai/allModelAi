const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    createStepProgressReporter,
    imageProgressToPercent,
    normalizeJobStatus,
} = require('../src/services/jobProgressTracker');
const { buildPublicJobSnapshot } = require('../src/services/jobPublicSnapshot');

test('step progress advances only on reportStep calls', () => {
    const seen = [];
    const reporter = createStepProgressReporter(4, {
        onReport: (snap) => seen.push(snap.progress),
    });
    reporter.reportStep(0, 'One');
    reporter.reportStep(1, 'Two');
    assert.deepEqual(seen, [0, 25]);
    reporter.complete('Done');
    assert.equal(seen.at(-1), 100);
});

test('ETA stays null until two steps complete', () => {
    const reporter = createStepProgressReporter(3, {});
    const first = reporter.reportStep(0, 'A');
    assert.equal(first.etaSeconds, null);
    assert.equal(first.etaLabel, 'Estimating…');
});

test('image progress maps completed/total to percent', () => {
    assert.equal(imageProgressToPercent({ completed: 2, total: 4 }), 50);
    assert.equal(imageProgressToPercent(null), null);
});

test('normalizeJobStatus maps canceled variants', () => {
    assert.equal(normalizeJobStatus('canceled'), 'cancelled');
    assert.equal(normalizeJobStatus('processing'), 'running');
});

test('buildPublicJobSnapshot exposes step metadata from payload', () => {
    const row = {
        id: 'job-1',
        type: 'document',
        status: 'running',
        progress: 40,
        stage: 'Analyzing',
        payload: JSON.stringify({ jobMeta: { stepIndex: 2, stepTotal: 4, etaLabel: '~8 sec' } }),
        result: null,
        error: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:01.000Z',
    };
    const snap = buildPublicJobSnapshot(row);
    assert.equal(snap.stepIndex, 2);
    assert.equal(snap.stepTotal, 4);
    assert.equal(snap.status, 'running');
});
