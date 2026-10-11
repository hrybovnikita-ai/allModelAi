import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
test('creditStatus helpers encode owner preview vs Plus (source contract)', async () => {
  const creditStatus = await readFile(new URL('../src/lib/creditStatus.js', import.meta.url), 'utf8');
  const accessMode = await readFile(new URL('../src/lib/accessMode.js', import.meta.url), 'utf8');
  assert.match(creditStatus, /ownerUnlimited/);
  assert.match(creditStatus, /plusActive/);
  assert.match(accessMode, /ownerPlusActive/);
  assert.match(accessMode, /patchAccessMode/);
});

test('Settings exposes owner-only Developer Mode panel', async () => {
  const settings = await readFile(new URL('../src/components/Settings/Settings.jsx', import.meta.url), 'utf8');
  const panel = await readFile(new URL('../src/components/Settings/DeveloperModeSettings.jsx', import.meta.url), 'utf8');
  assert.match(settings, /DeveloperModeSettings/);
  assert.match(panel, /canManageOwnerMode/);
  assert.match(panel, /developer-mode-segment/);
  assert.match(panel, /patchAccessMode/);
});
