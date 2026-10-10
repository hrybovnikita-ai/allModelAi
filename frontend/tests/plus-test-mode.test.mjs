import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chatSource = fs.readFileSync(path.join(root, 'src/components/Chat/Chat.jsx'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');

test('chat exposes Plus Test Mode indicator and diagnostics link fields', () => {
  assert.match(chatSource, /plusTestMode/);
  assert.match(chatSource, /plus-test-mode-badge/);
  assert.match(chatSource, /Plus Test Mode/);
  assert.match(chatSource, /canAccessModelDiagnostics/);
  assert.match(chatSource, /\/developer\/model-diagnostics/);
});

test('app registers developer model diagnostics route', () => {
  assert.match(appSource, /developer\/model-diagnostics/);
  assert.match(appSource, /ModelDiagnostics/);
});
