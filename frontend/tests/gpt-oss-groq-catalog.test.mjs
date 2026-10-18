import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('GPT-OSS 120B — Groq appears in dashboard catalog with GroqCloud provider', () => {
  const catalog = readFileSync(join(root, 'src/data/dashboardModels.js'), 'utf8');
  assert.match(catalog, /slug: 'gpt-oss-groq'/);
  assert.match(catalog, /name: 'GPT-OSS 120B — Groq'/);
  assert.match(catalog, /provider: 'GroqCloud'/);
  assert.doesNotMatch(catalog, /gpt-oss-groq[\s\S]{0,200}GPT-4\.1 Mini/);
});

test('Cloudflare GPT-OSS entry remains distinct from Groq GPT-OSS', () => {
  const catalog = readFileSync(join(root, 'src/data/dashboardModels.js'), 'utf8');
  assert.match(catalog, /slug: 'gpt-oss'/);
  assert.match(catalog, /name: 'GPT-OSS \(Cloudflare\)'/);
  assert.match(catalog, /slug: 'gpt-oss-groq'/);
});

test('capability meta uses openai/gpt-oss-120b', () => {
  const meta = readFileSync(join(root, 'src/data/modelCapabilitiesMeta.js'), 'utf8');
  assert.match(meta, /'gpt-oss-groq': \{ modelId: 'openai\/gpt-oss-120b'/);
  assert.match(meta, /'gpt-oss-groq'/);
});
