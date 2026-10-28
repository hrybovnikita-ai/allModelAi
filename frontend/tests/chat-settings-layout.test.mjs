import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/components/ChatSettings/ChatSettings.jsx'), 'utf8');

test('settings page keeps sections separate and stores appearance locally', () => {
  for (const label of ['My Profile', 'Language & Region', 'Text & Colors', 'Code Assistant']) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /allmodelai_appearance/);
  assert.match(source, /allmodelai_code_assistant/);
  assert.match(source, /responseLanguage/);
  assert.doesNotMatch(source, /localStorage\.setItem\('allmodelai_avatar', user\.photoURL\)/);
});
