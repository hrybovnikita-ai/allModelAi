import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeAnoninModelSlug } from '../src/lib/anoninModelSlug.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('normalizeAnoninModelSlug fixes anonim typo', () => {
  assert.equal(normalizeAnoninModelSlug('anonim'), 'anonin');
  assert.equal(normalizeAnoninModelSlug('anonymous'), 'anonin');
});

test('Anonin Model appears in dashboard catalog', () => {
  const catalog = readFileSync(join(root, 'src/data/dashboardModels.js'), 'utf8');
  assert.match(catalog, /slug:'anonin'/);
  assert.match(catalog, /name:'Anonin Model'/);
});

test('Chat integrates reveal UI and strategy bar', () => {
  const chat = readFileSync(join(root, 'src/components/Chat/Chat.jsx'), 'utf8');
  assert.match(chat, /AnoninMessageReveal/);
  const reveal = readFileSync(join(root, 'src/components/Chat/AnoninMessageReveal.jsx'), 'utf8');
  assert.match(reveal, /Reveal AI Model/);
  assert.match(chat, /anoninStrategy/);
  assert.match(chat, /assistantMessageId/);
});

test('Anonin reveal client calls secured API', () => {
  const client = readFileSync(join(root, 'src/lib/anoninClient.js'), 'utf8');
  assert.match(client, /\/api\/chat\/anonin\/reveal/);
});
