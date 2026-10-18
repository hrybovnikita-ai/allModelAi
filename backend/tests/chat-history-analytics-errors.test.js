'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classifyProviderError } = require('../src/services/providerErrorClassification');
const { PUBLIC_STATUS_LABELS } = require('../src/services/healthMonitorService');

test('classifyProviderError maps 402 to insufficient credits', () => {
    const classified = classifyProviderError({
        httpStatus: 402,
        message: 'Insufficient credits',
        billingHint: true,
    });
    assert.equal(classified.errorClass, 'quota_exhausted');
    assert.equal(classified.operationalStatus, 'quota_exhausted');
    assert.equal(classified.retryable, false);
});

test('classifyProviderError maps 401 to invalid API key', () => {
    const classified = classifyProviderError({ httpStatus: 401, message: 'Invalid API key' });
    assert.equal(classified.errorClass, 'authentication_failed');
    assert.equal(classified.operationalStatus, 'authentication_failed');
});

test('classifyProviderError maps 404 model miss to unsupported_model', () => {
    const classified = classifyProviderError({
        httpStatus: 404,
        message: 'No endpoints found for model',
    });
    assert.equal(classified.errorClass, 'unsupported_model');
});

test('health monitor public labels distinguish credits from rate limits', () => {
    assert.equal(PUBLIC_STATUS_LABELS.operational, 'Available');
    assert.equal(PUBLIC_STATUS_LABELS.quota_exhausted, 'Insufficient credits');
    assert.equal(PUBLIC_STATUS_LABELS.rate_limited, 'Rate limited');
    assert.equal(PUBLIC_STATUS_LABELS.authentication_failed, 'Invalid API key');
    assert.equal(PUBLIC_STATUS_LABELS.unsupported_model, 'Unsupported model');
    assert.equal(PUBLIC_STATUS_LABELS.not_configured, 'Not configured');
});
