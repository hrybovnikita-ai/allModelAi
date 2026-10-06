import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tokens = fs.readFileSync(path.join(frontendRoot, 'src/styles/design-system.css'), 'utf8');
const main = fs.readFileSync(path.join(frontendRoot, 'src/main.jsx'), 'utf8');

test('design system defines core tokens without replacing brand purple', () => {
  assert.match(tokens, /--purple:\s*#7c5cff/);
  assert.match(tokens, /--background:/);
  assert.match(tokens, /--radius-md:/);
  assert.match(tokens, /--duration-normal:/);
});

test('main.jsx loads design system globally', () => {
  assert.match(main, /styles\/design-system\.css/);
  assert.match(main, /styles\/premium-ui\.css/);
});
