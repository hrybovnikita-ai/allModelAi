const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    filterProviders,
    sortProviders,
    sanitizeProviderRow,
    parseWindow,
    buildSummary,
} = require('../src/services/healthMonitorService');

const WINDOW_MS = {
    '1h': 60 * 60 * 1000,
};
const { healthPenaltyForSlug, isHealthAwareRoutingEnabled } = require('../src/services/providerHealthHints');
const { resetForTests, recordProviderRequest } = require('../src/services/providerRequestTelemetry');

test('parseWindow accepts monitoring windows', () => {
    assert.equal(parseWindow('15m').ms, 15 * 60 * 1000);
    assert.equal(parseWindow('7d').key, '7d');
    assert.equal(parseWindow('bogus').ms, WINDOW_MS['1h']);
});

test('sanitizeProviderRow hides diagnostic secrets and maps labels', () => {
    const row = sanitizeProviderRow({
        id: 'openai',
        displayName: 'OpenAI',
        status: 'operational',
        configured: true,
        successRate: 0.95,
        averageLatencyMs: 120,
        recentErrorTypes: { authentication_failed: 1 },
        staleObservation: false,
    });
    assert.equal(row.status, 'Operational');
    assert.equal(row.statusKey, 'operational');
    assert.deepEqual(row.recentErrorCategories, ['authentication_failed']);
    assert.doesNotMatch(JSON.stringify(row), /sk-/);
});

test('filterProviders and sortProviders', () => {
    const providers = [
        { id: 'a', displayName: 'Alpha', status: 'operational', successRate: 0.9, averageLatencyMs: 200 },
        { id: 'b', displayName: 'Beta', status: 'degraded', successRate: 0.5, averageLatencyMs: 100 },
    ];
    const degraded = filterProviders(providers, { statusFilter: 'degraded' });
    assert.equal(degraded.length, 1);
    assert.equal(degraded[0].id, 'b');
    const byLatency = sortProviders(providers, 'latency');
    assert.equal(byLatency[0].id, 'b');
});

test('buildSummary aggregates provider counts', () => {
    const providers = [
        { status: 'operational', configured: true, successRate: 1, averageLatencyMs: 100 },
        { status: 'degraded', configured: true, successRate: 0.5, averageLatencyMs: 200 },
        { status: 'not_configured', configured: false },
    ];
    const models = [{ id: 'gpt' }, { id: 'gemini' }];
    const summary = buildSummary(providers, models);
    assert.equal(summary.operationalProviders, 1);
    assert.equal(summary.degradedProviders, 1);
    assert.equal(summary.totalModels, 2);
    assert.equal(summary.averageLatencyMs, 150);
});

test('healthPenaltyForSlug is off unless SMART_ROUTER_USE_HEALTH=1', () => {
    const prev = process.env.SMART_ROUTER_USE_HEALTH;
    delete process.env.SMART_ROUTER_USE_HEALTH;
    assert.equal(isHealthAwareRoutingEnabled(), false);
    assert.equal(healthPenaltyForSlug('gpt'), 0);
    process.env.SMART_ROUTER_USE_HEALTH = '1';
    resetForTests();
    recordProviderRequest({
        provider: 'openai',
        success: false,
        httpStatus: 401,
        message: 'invalid key',
    });
    assert.ok(healthPenaltyForSlug('gpt') < 0);
    if (prev === undefined) delete process.env.SMART_ROUTER_USE_HEALTH;
    else process.env.SMART_ROUTER_USE_HEALTH = prev;
    resetForTests();
});
