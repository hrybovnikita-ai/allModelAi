const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildUsageAnalyticsPayload } = require('../src/services/userAnalyticsAggregate');
const { computeUserAnalyticsAggregatesAsync } = require('../src/db/postgresHttpReads');

test('buildUsageAnalyticsPayload aggregates SQL rows without message blobs', () => {
    const payload = buildUsageAnalyticsPayload([
        { model: 'gemini', conversations: 2, messages: 10, characters: 400 },
        { model: 'gpt', conversations: 1, messages: 4, characters: 120 },
    ]);
    assert.equal(payload.conversations, 3);
    assert.equal(payload.messages, 14);
    assert.equal(payload.estimatedTokens, Math.ceil(520 / 4));
    assert.equal(payload.byModel.gemini, 2);
    assert.equal(payload.freeConversations, 2);
});

test('computeUserAnalyticsAggregatesAsync falls back when is_temporary column is missing', async () => {
    const calls = [];
    const pool = {
        async query(config) {
            const text = typeof config === 'string' ? config : config.text;
            calls.push(text);
            if (/is_temporary/i.test(text)) {
                const error = new Error('column "is_temporary" does not exist');
                error.code = '42703';
                throw error;
            }
            return {
                rows: [{ model: 'gpt', conversations: 1, messages: 2, characters: 50 }],
            };
        },
    };

    const rows = await computeUserAnalyticsAggregatesAsync(
        { engine: 'postgres', pgAsyncPool: pool },
        'owner@example.com',
    );

    assert.equal(calls.length, 2);
    assert.match(calls[0], /is_temporary/i);
    assert.doesNotMatch(calls[1], /is_temporary/i);
    assert.equal(rows[0].messages, 2);
});
