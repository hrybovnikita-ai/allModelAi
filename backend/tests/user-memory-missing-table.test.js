const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getSettings } = require('../src/services/userMemoryService');

test('getSettings returns defaults when user_ai_settings table is missing on postgres', async () => {
    const connection = {
        engine: 'postgres',
        pgAsyncPool: {
            query: async () => {
                const error = new Error('relation "user_ai_settings" does not exist');
                error.code = '42P01';
                throw error;
            },
        },
    };

    const settings = await getSettings(connection, 'user@example.com');
    assert.equal(settings.memoryEnabled, false);
    assert.equal(settings.shareFeedback, true);
});
