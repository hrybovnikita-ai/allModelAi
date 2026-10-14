import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  filterProvidersClient,
  sortProvidersClient,
  statusBadgeClass,
  formatPercent,
} from '../src/lib/providerHealthDashboard.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('Provider health route and dashboard component exist', () => {
  const app = readFileSync(join(root, 'src/App.jsx'), 'utf8');
  assert.match(app, /provider-health/);
  assert.match(app, /ProviderHealthDashboard/);
  const page = readFileSync(
    join(root, 'src/components/ProviderHealth/ProviderHealthDashboard.jsx'),
    'utf8',
  );
  assert.match(page, /AI Provider Health Monitor/);
  assert.match(page, /Refresh now/);
  assert.match(page, /Success rate over time/);
});

test('client filters and sort helpers', () => {
  const providers = [
    { id: 'openai', displayName: 'OpenAI', statusKey: 'operational', successRate: 0.99 },
    { id: 'anthropic', displayName: 'Anthropic', statusKey: 'degraded', successRate: 0.4 },
  ];
  const filtered = filterProvidersClient(providers, { statusFilter: 'degraded' });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'anthropic');
  const sorted = sortProvidersClient(providers, 'success');
  assert.equal(sorted[0].id, 'openai');
  assert.equal(statusBadgeClass('operational'), 'ph-status--ok');
  assert.equal(formatPercent(0.876), '88%');
});
