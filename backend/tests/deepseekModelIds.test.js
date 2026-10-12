const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveDeepSeekApiModel, resolveDeepSeekVariantId } = require('../src/services/deepseekModelIds');

describe('deepseekModelIds', () => {
    test('defaults to current API ids', () => {
        assert.equal(resolveDeepSeekApiModel('flash'), 'deepseek-flash');
        assert.equal(resolveDeepSeekApiModel('pro'), 'deepseek-v4-pro');
        assert.equal(resolveDeepSeekApiModel('reasoning'), 'deepseek-v4-pro');
    });

    test('maps legacy variant ids', () => {
        assert.equal(resolveDeepSeekVariantId('chat'), 'flash');
        assert.equal(resolveDeepSeekVariantId('reasoning'), 'pro');
    });
});
