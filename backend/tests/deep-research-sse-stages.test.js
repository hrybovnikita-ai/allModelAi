const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { STAGE_FROM_EVENT } = require('../src/services/deepResearch/researchEvents');

describe('Deep Research SSE stage map', () => {
    test('includes post-search analysis and writing completion events', () => {
        const required = [
            'research.started',
            'research.plan_created',
            'search.started',
            'search.completed',
            'analysis.started',
            'analysis.completed',
            'verification.started',
            'verification.completed',
            'writing.started',
            'writing.completed',
            'research.completed',
        ];
        required.forEach((event) => {
            assert.ok(STAGE_FROM_EVENT[event], `missing stage for ${event}`);
        });
    });
});
