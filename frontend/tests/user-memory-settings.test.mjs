import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('UserMemorySettings provides opt-in UI with ConfirmDialog clear/delete flows', () => {
  const settingsPage = readFileSync(path.join(rootDir, 'src/components/Settings/Settings.jsx'), 'utf8');
  const memoryUi = readFileSync(
    path.join(rootDir, 'src/components/Settings/UserMemorySettings.jsx'),
    'utf8',
  );
  const api = readFileSync(path.join(rootDir, 'src/lib/aiImprovement.js'), 'utf8');
  const app = readFileSync(path.join(rootDir, 'src/App.jsx'), 'utf8');

  assert.match(settingsPage, /import UserMemorySettings from '\.\/UserMemorySettings'/);
  assert.match(settingsPage, /<UserMemorySettings\s*\/>/);
  assert.match(settingsPage, /#ai-memory/);

  assert.match(memoryUi, /import ConfirmDialog from '\.\.\/ConfirmDialog\/ConfirmDialog'/);
  assert.match(memoryUi, /Enable AI memory/);
  assert.match(memoryUi, /checked=\{memoryEnabled\}/);
  assert.match(memoryUi, /Clear all memories/);
  assert.match(memoryUi, /Clear all memories\?/);
  assert.match(memoryUi, /Delete memory\?/);
  assert.match(memoryUi, /searchUserMemories/);
  assert.match(memoryUi, /role="alert"/);
  assert.match(memoryUi, /role="status"/);
  assert.match(memoryUi, /memory-empty/);
  assert.doesNotMatch(memoryUi, /window\.confirm\(/);
  assert.doesNotMatch(memoryUi, /memoryEnabled:\s*true/);

  assert.match(api, /\/api\/ai\/memory\/settings/);
  assert.match(api, /\/api\/ai\/memory\/search/);
  assert.match(api, /export async function clearAllUserMemories/);
  assert.match(api, /export async function searchUserMemories/);

  assert.match(app, /path="\/ai-memory"/);
  assert.match(app, /path="\/settings"/);
});

test('AiMemoryPage reuses Settings memory section without enabling chat injection', () => {
  const page = readFileSync(path.join(rootDir, 'src/components/Memory/AiMemoryPage.jsx'), 'utf8');
  assert.match(page, /UserMemorySettings/);
  assert.match(page, /Memory is off until you enable it/);
  assert.doesNotMatch(page, /ZILLIZ_MEMORY_CHAT_INJECTION\s*=\s*true/);
});
