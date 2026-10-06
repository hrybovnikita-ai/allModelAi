import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('Model Lab route and component exist', () => {
  const app = readFileSync(join(root, 'src/App.jsx'), 'utf8');
  assert.match(app, /model-lab/);
  assert.match(app, /ModelLab/);
  const lab = readFileSync(join(root, 'src/components/ModelLab/ModelLab.jsx'), 'utf8');
  assert.match(lab, /AI Training Lab/);
  assert.match(lab, /Start Training/);
  assert.match(lab, /linear-regression/);
  assert.match(lab, /OpenAI API/);
});
