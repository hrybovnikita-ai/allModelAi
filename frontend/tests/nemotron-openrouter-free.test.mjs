import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODEL_TECH_SPECS, MODEL_CAPABILITY_FLAGS } from '../src/data/modelCapabilitiesMeta.js';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dashboardModelsSource = fs.readFileSync(
  path.join(frontendRoot, 'src/data/dashboardModels.js'),
  'utf8',
);
const variantsSource = fs.readFileSync(
  path.join(frontendRoot, '../backend/src/data/modelVariants.json'),
  'utf8',
);

test('NVIDIA Nemotron 3 Ultra is listed in the model selector catalog', () => {
  assert.match(dashboardModelsSource, /slug:\s*'nemotron'/);
  assert.match(dashboardModelsSource, /NVIDIA Nemotron 3 Ultra/);
  assert.match(dashboardModelsSource, /NVIDIA \/ OpenRouter/);
  assert.match(dashboardModelsSource, /Free OpenRouter endpoint/);
  assert.match(dashboardModelsSource, /Reasoning/);
});

test('Nemotron UI metadata matches the free OpenRouter model id', () => {
  assert.equal(MODEL_TECH_SPECS.nemotron.modelId, 'nvidia/nemotron-3-ultra-550b-a55b:free');
  assert.equal(MODEL_TECH_SPECS.nemotron.contextWindow, '1M');
  assert.equal(MODEL_CAPABILITY_FLAGS.nemotron.reasoning, true);
  assert.equal(MODEL_CAPABILITY_FLAGS.nemotron.streaming, true);
  assert.match(variantsSource, /"nemotron"/);
  assert.match(variantsSource, /nvidia\/nemotron-3-ultra-550b-a55b:free/);
  assert.doesNotMatch(
    variantsSource,
    /"nemotron"\s*:\s*\[[^\]]*nvidia\/nemotron-3-ultra-550b-a55b"(?!:free)/,
  );
});
