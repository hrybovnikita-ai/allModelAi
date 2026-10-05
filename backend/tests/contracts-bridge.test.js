const { test } = require('node:test');
const assert = require('node:assert/strict');

test('contracts bridge parses router preview payloads', () => {
  const { parseRoutingDecision } = require('../src/shared/contractsBridge');
  const result = parseRoutingDecision({
    model: 'gemini',
    reason: 'test',
    category: 'general',
  });
  assert.equal(result.success, true);
});

test('contracts bridge parses python health JSON', () => {
  const { parseAiHealthResponse } = require('../src/shared/contractsBridge');
  const result = parseAiHealthResponse({ status: 'ok', service: 'pytorch_ai_service' });
  assert.equal(result.success, true);
});
