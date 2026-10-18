const { test } = require('node:test');
const assert = require('node:assert/strict');
const { listAnalyticsConversationRows } = require('../src/db/postgresHttpReads');

test('analytics query falls back when is_temporary column is missing', async () => {
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
                rows: [
                    {
                        model: 'gemini',
                        messages: '[]',
                        createdAt: '2026-01-01T00:00:00.000Z',
                    },
                ],
            };
        },
    };

    const rows = await listAnalyticsConversationRows(
        { engine: 'postgres', pgAsyncPool: pool },
        'owner@example.com',
    );

    assert.equal(calls.length, 2);
    assert.match(calls[0], /is_temporary/i);
    assert.doesNotMatch(calls[1], /is_temporary/i);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].model, 'gemini');
});
