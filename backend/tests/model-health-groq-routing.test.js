'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    resolveGroqDirectModel,
    resolveGroqOpenRouterGateway,
    stripGroqApiModelPrefix,
    mapGroqHttpError,
} = require('../src/services/groqChat');
const { classifyModelHealthStatus } = require('../src/services/modelHealthLabels');
const { markGatewayModelBlocked, clearGatewayModelHealthForTests } = require('../src/services/gatewayModelHealth');
const { listEligibleAnoninSlugs } = require('../src/services/anoninService');

test('Groq direct API never receives groq/ OpenRouter model prefix', () => {
    assert.equal(stripGroqApiModelPrefix('groq/llama-3.3-70b-versatile'), 'llama-3.3-70b-versatile');
    assert.equal(
        resolveGroqDirectModel({ gateway: 'groq/llama-3.3-70b-versatile', direct: 'llama-3.3-70b-versatile' }, 'groq'),
        'llama-3.3-70b-versatile',
    );
    assert.equal(
        resolveGroqDirectModel({ gateway: 'groq/llama-3.3-70b-versatile' }, 'groq'),
        'llama-3.3-70b-versatile',
    );
    assert.equal(
        resolveGroqOpenRouterGateway({ direct: 'llama-3.3-70b-versatile' }),
        'groq/llama-3.3-70b-versatile',
    );
});

test('Groq invalid model id maps to GROQ_MODEL_NOT_FOUND', () => {
    const mapped = mapGroqHttpError(400, 'groq/llama-3.3-70b-versatile is not a valid model ID');
    assert.equal(mapped?.code, 'GROQ_MODEL_NOT_FOUND');
});

test('Model health labels require successful inference for Working', () => {
    assert.equal(
        classifyModelHealthStatus({ availabilityStatus: 'WORKING', lastTest: { ok: true } }),
        'Working',
    );
    assert.equal(
        classifyModelHealthStatus({ availabilityStatus: 'WORKING', lastTest: null, routeMode: 'openai' }),
        'Not Tested',
    );
    assert.equal(
        classifyModelHealthStatus({
            availabilityStatus: 'INVALID_MODEL',
            lastTest: { ok: false, httpStatus: 404, errorDescription: 'model not found' },
        }),
        'Invalid Model ID',
    );
});

test('Anonin and Smart Router health exclude gateway-blocked groq slug', () => {
    clearGatewayModelHealthForTests();
    markGatewayModelBlocked({ slug: 'groq', reason: 'unsupported_model' });
    const eligible = listEligibleAnoninSlugs(() => true);
    assert.ok(!eligible.includes('groq'));
    clearGatewayModelHealthForTests();
});
