'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
    ERROR_CATEGORIES,
    categorizeHttpStatus,
    shouldTryFallback,
} = require('../src/services/smartRouter2/fallbacks');

const {
    classifyFailure,
    mayAttemptFallback,
    selectFallbackCandidates,
    createFallbackTracker,
    computeBackoffMs,
    buildFallbackNotice,
    runFallbackChain,
    isFallbackFeatureEnabled,
    maxFallbackAttempts,
} = require('../src/services/automaticFallback');

describe('fallback failure classification', () => {
    test('does not retry authentication failures', () => {
        assert.equal(categorizeHttpStatus(401), ERROR_CATEGORIES.auth);
        assert.equal(categorizeHttpStatus(403), ERROR_CATEGORIES.auth);
        assert.equal(shouldTryFallback(ERROR_CATEGORIES.auth), false);
        assert.equal(mayAttemptFallback(ERROR_CATEGORIES.auth), false);
    });

    test('does not retry invalid requests', () => {
        assert.equal(categorizeHttpStatus(400), ERROR_CATEGORIES.invalid);
        assert.equal(shouldTryFallback(ERROR_CATEGORIES.invalid), false);
        assert.equal(
            mayAttemptFallback(classifyFailure({ status: 400, detail: 'invalid_request' })),
            false,
        );
    });

    test('retries timeout, rate limit, outage and quota exhaustion', () => {
        assert.equal(shouldTryFallback(ERROR_CATEGORIES.timeout), true);
        assert.equal(shouldTryFallback(ERROR_CATEGORIES.rate_limit), true);
        assert.equal(shouldTryFallback(ERROR_CATEGORIES.server), true);
        assert.equal(shouldTryFallback(ERROR_CATEGORIES.network), true);
        assert.equal(
            mayAttemptFallback(classifyFailure({
                status: 429,
                detail: 'insufficient quota exceeded',
            })),
            true,
        );
    });
});

describe('fallback candidate selection', () => {
    test('prevents loops and respects permissions', () => {
        const candidates = selectFallbackCandidates({
            requestedSlug: 'claude',
            preferredChain: ['claude', 'gemini', 'gpt', 'gemini', 'mistral'],
            modelAllowed: (slug) => slug !== 'gpt',
            visited: new Set(['mistral']),
            maxAttempts: 5,
        });
        assert.deepEqual(candidates, ['gemini']);
    });

    test('caps attempts to configured maximum', () => {
        const candidates = selectFallbackCandidates({
            requestedSlug: 'claude',
            preferredChain: ['gemini', 'gpt', 'mistral', 'llama', 'deepseek'],
            maxAttempts: 2,
        });
        assert.equal(candidates.length, 2);
        assert.ok(maxFallbackAttempts() >= 1);
    });
});

describe('fallback tracker and recovery', () => {
    test('tracker blocks infinite fallback loops', () => {
        const tracker = createFallbackTracker({ requestedSlug: 'claude' });
        tracker.record({ from: 'claude', to: 'gemini', category: 'timeout', success: false });
        tracker.record({ from: 'claude', to: 'gpt', category: 'timeout', success: false });
        tracker.record({ from: 'claude', to: 'mistral', category: 'timeout', success: false });
        assert.equal(tracker.canAttempt(), false);
        assert.ok(tracker.visited.has('claude'));
        assert.ok(tracker.visited.has('gemini'));
    });

    test('runFallbackChain recovers on a later candidate with backoff', async () => {
        process.env.AI_FALLBACK_BACKOFF_MS = '1';
        const calls = [];
        const result = await runFallbackChain({
            from: 'claude',
            category: ERROR_CATEGORIES.timeout,
            candidates: ['gemini', 'gpt'],
            attemptFn: async (candidate) => {
                calls.push(candidate);
                return { ok: candidate === 'gpt' };
            },
        });
        assert.equal(result.ok, true);
        assert.equal(result.candidate, 'gpt');
        assert.deepEqual(calls, ['gemini', 'gpt']);
        assert.ok(computeBackoffMs(0) >= 1);
    });

    test('buildFallbackNotice explains original vs actual model', () => {
        const notice = buildFallbackNotice({
            requestedModel: 'claude',
            actualModel: 'gemini',
            category: 'timeout',
        });
        assert.match(notice, /gemini/i);
        assert.match(notice, /claude/i);
    });

    test('feature flag defaults to enabled', () => {
        delete process.env.FEATURE_AI_FALLBACK;
        assert.equal(isFallbackFeatureEnabled(), true);
    });
});
