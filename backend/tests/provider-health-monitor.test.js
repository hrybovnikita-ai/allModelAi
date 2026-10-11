const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    classifyProviderError,
    slugToProviderId,
    sanitizeProviderHint,
} = require('../src/services/providerErrorClassification');
const {
    recordProviderRequest,
    passiveStatusForProvider,
    resetForTests,
} = require('../src/services/providerRequestTelemetry');
const { mergeOperationalStatus } = require('../src/services/providerHealthMonitor');

test('classifyProviderError maps HTTP statuses', () => {
    assert.equal(classifyProviderError({ httpStatus: 401 }).errorClass, 'authentication_failed');
    assert.equal(classifyProviderError({ httpStatus: 403 }).errorClass, 'permission_denied');
    assert.equal(classifyProviderError({ httpStatus: 429 }).errorClass, 'rate_limited');
    assert.equal(classifyProviderError({ httpStatus: 400 }).errorClass, 'invalid_request');
    assert.equal(classifyProviderError({ httpStatus: 502 }).errorClass, 'server_error');
    assert.equal(classifyProviderError({ timedOut: true }).errorClass, 'timeout');
});

test('classifyProviderError distinguishes quota vs generic 429', () => {
    const quota = classifyProviderError({
        httpStatus: 429,
        message: 'Your credit balance is too low',
    });
    assert.equal(quota.errorClass, 'quota_exhausted');
    assert.equal(quota.operationalStatus, 'quota_exhausted');
});

test('sanitizeProviderHint redacts key-like tokens', () => {
    const hint = sanitizeProviderHint('Failed with sk-abcdefghijklmnopqrstuvwxyz1234567890');
    assert.match(hint, /\[redacted\]/);
    assert.doesNotMatch(hint, /sk-abc/);
});

test('passive telemetry requires multiple failures before unavailable', () => {
    resetForTests();
    recordProviderRequest({
        provider: 'claude',
        success: false,
        latencyMs: 120,
        httpStatus: 401,
        message: 'invalid x-api-key',
    });
    let passive = passiveStatusForProvider('claude', true);
    assert.equal(passive.operationalStatus, 'authentication_failed');

    resetForTests();
    for (let i = 0; i < 3; i += 1) {
        recordProviderRequest({
            provider: 'openai',
            success: false,
            httpStatus: 500,
            message: 'upstream error',
        });
    }
    passive = passiveStatusForProvider('openai', true);
    assert.equal(passive.operationalStatus, 'unavailable');

    resetForTests();
    recordProviderRequest({ provider: 'openai', success: true, latencyMs: 90 });
    passive = passiveStatusForProvider('openai', true);
    assert.equal(passive.operationalStatus, 'operational');
});

test('mergeOperationalStatus never marks configured-only as operational', () => {
    const merged = mergeOperationalStatus({
        configured: true,
        passive: { operationalStatus: 'unknown', availability: 'not_tested', source: 'passive' },
        probeOperational: null,
        routerRow: null,
    });
    assert.equal(merged.status, 'configured');
});

test('slugToProviderId maps chat slugs', () => {
    assert.equal(slugToProviderId('gpt'), 'openai');
    assert.equal(slugToProviderId('claude'), 'claude');
});
