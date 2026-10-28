'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const variants = require('../src/data/modelVariants.json');
const { resolveGeminiDirectModel } = require('../src/services/geminiModelRouting');
const { mapGeminiHttpError, retryTransient503 } = require('../src/services/geminiApiService');
const { classifyModelHealthStatus } = require('../src/services/modelHealthLabels');
const { shouldUseGoogleGeminiDirect } = require('../src/services/geminiModelRouting');

test('model variant ids are unique inside each family', () => {
    for (const [family, rows] of Object.entries(variants)) {
        const ids = rows.map((row) => row.id);
        assert.equal(new Set(ids).size, ids.length, `${family} has duplicate variant ids`);
    }
    const geminiDirect = variants.gemini.map((row) => row.direct);
    assert.equal(new Set(geminiDirect).size, geminiDirect.length);
});

test('Gemini direct ids are never rewritten to Gemini 2.5 Flash', () => {
    for (const row of variants.gemini) {
        const resolved = resolveGeminiDirectModel({ selectedVariant: row });
        assert.equal(resolved, row.direct);
        assert.notEqual(resolved, 'gemini-2.5-flash');
        assert.notEqual(resolved, row.gateway);
    }
    assert.equal(variants.gemini.find((row) => row.id === '3-flash').direct, 'gemini-3-flash-preview');
    assert.equal(variants.gemini.find((row) => row.id === '3.5-flash-lite').direct, 'gemini-3.5-flash-lite');
});

test('503 is temporarily unavailable and quota is not an invalid model id', () => {
    const unavailable = mapGeminiHttpError(503, 'This model is currently experiencing high demand.');
    assert.equal(unavailable.errorClass, 'server_error');
    assert.equal(
        classifyModelHealthStatus({
            lastTest: { ok: false, httpStatus: 503, errorDescription: unavailable.message },
        }),
        'Temporarily Unavailable',
    );
    const quota = mapGeminiHttpError(429, 'You exceeded your current quota, please check your plan and billing details.');
    assert.equal(quota.errorClass, 'quota_exceeded');
    assert.notEqual(
        classifyModelHealthStatus({
            lastTest: { ok: false, httpStatus: 429, errorDescription: quota.message },
        }),
        'Invalid Model ID',
    );
});

test('503 retries stop at the limit and 429 is not retried', async () => {
    let calls = 0;
    const response = await retryTransient503(async () => {
        calls += 1;
        return { status: 503, body: { cancel() {} } };
    }, { maxAttempts: 3, baseMs: 1, random: () => 0 });
    assert.equal(calls, 3);
    assert.equal(response.status, 503);

    let quotaCalls = 0;
    const quota = await retryTransient503(async () => {
        quotaCalls += 1;
        return { status: 429 };
    }, { maxAttempts: 3, baseMs: 1, random: () => 0 });
    assert.equal(quotaCalls, 1);
    assert.equal(quota.status, 429);
});

test('direct Gemini routing stays on Google when a key is configured', () => {
    const previous = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'test-key';
    try {
        assert.equal(shouldUseGoogleGeminiDirect('gemini'), true);
        assert.equal(shouldUseGoogleGeminiDirect('grok'), false);
    } finally {
        if (previous === undefined) delete process.env.GEMINI_API_KEY;
        else process.env.GEMINI_API_KEY = previous;
    }
});
