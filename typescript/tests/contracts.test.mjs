import { test } from 'node:test';
import assert from 'node:assert/strict';

test('parseRoutingDecision accepts Smart Router preview payloads', async () => {
  const { parseRoutingDecision } = await import('../dist/validation/schemas.js');
  const result = parseRoutingDecision({
    model: 'gemini',
    reason: 'Balanced routing selected Gemini',
    category: 'coding',
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.model, 'gemini');
    assert.equal(result.data.category, 'coding');
  }
});

test('parseAiHealthResponse accepts python /health JSON', async () => {
  const { parseAiHealthResponse } = await import('../dist/validation/schemas.js');
  const result = parseAiHealthResponse({
    status: 'ok',
    service: 'pytorch_ai_service',
    device: 'cpu',
  });
  assert.equal(result.success, true);
});

test('parseTrainingProgress accepts trainer status payloads', async () => {
  const { parseTrainingProgress } = await import('../dist/validation/schemas.js');
  const result = parseTrainingProgress({
    status: 'ready',
    is_training: false,
    progress_percent: 0,
    loss_history: [0.4, 0.2],
  });
  assert.equal(result.success, true);
});

test('resolveBackendApiBaseUrl does not hardcode production domain', async () => {
  const { resolveBackendApiBaseUrl } = await import('../dist/config/env.js');
  assert.equal(
    resolveBackendApiBaseUrl({ env: { API_BASE_URL: 'https://example.test' } }),
    'https://example.test',
  );
  assert.equal(
    resolveBackendApiBaseUrl({ env: {} }),
    'http://127.0.0.1:5050',
  );
});

test('AI provider catalog documents server env hints without secrets', async () => {
  const { AI_PROVIDER_CATALOG } = await import('../dist/services/providers/registry.js');
  assert.ok(AI_PROVIDER_CATALOG.length >= 8);
  for (const provider of AI_PROVIDER_CATALOG) {
    assert.match(provider.id, /^[a-z0-9_-]+$/);
    assert.ok(provider.name.length > 0);
    if (provider.configKeyHints) {
      for (const key of provider.configKeyHints) {
        assert.doesNotMatch(key, /secret|password/i);
      }
    }
  }
});
