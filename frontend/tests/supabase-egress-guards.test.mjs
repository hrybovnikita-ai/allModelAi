import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('dashboard avoids legacy full-history analytics query', async () => {
  const dashboard = await readFile(
    new URL('../src/components/Dashboard/Dashboard.jsx', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(dashboard, /includeMessages=true/);
  assert.match(dashboard, /fetchUserAnalytics/);
});

test('backend analytics uses postgres aggregates', async () => {
  const controllers = await readFile(
    new URL('../../backend/src/controllers/controllers.js', import.meta.url),
    'utf8',
  );
  assert.match(controllers, /computeUserAnalyticsAggregatesAsync/);
  assert.match(controllers, /buildUsageAnalyticsPayload/);
});

test('chat history API deduplicates list fetches', async () => {
  const api = await readFile(new URL('../src/lib/chatHistoryApi.js', import.meta.url), 'utf8');
  assert.match(api, /listInflight/);
  assert.match(api, /LIST_CACHE_TTL_MS/);
});

test('production jobs polling is not sub-second', async () => {
  const prod = await readFile(
    new URL('../src/components/ProductionCenter/ProductionCenter.jsx', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(prod, /setInterval\([^,]+,\s*1000\)/);
  assert.match(prod, /5000/);
});
