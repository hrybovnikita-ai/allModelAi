import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INTERFACE_STRINGS } from '../src/lib/interfaceStrings.js';
import { translate } from '../src/lib/languages.js';
import { LANGUAGES } from '../src/lib/languages.js';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chatSettingsSource = fs.readFileSync(
  path.join(frontendRoot, 'src/components/ChatSettings/ChatSettings.jsx'),
  'utf8',
);

test('chat settings preview uses generic previewHello without user name', () => {
  assert.match(chatSettingsSource, /t\('previewHello'\)/);
  assert.doesNotMatch(chatSettingsSource, /previewHello',\s*\{name:/);
});

test('English previewHello is the required greeting', () => {
  assert.equal(INTERFACE_STRINGS.en.previewHello, 'Hello, can I help you today?');
  assert.equal(translate('previewHello', 'en'), 'Hello, can I help you today?');
});

test('previewHello has no name placeholder in any interface language', () => {
  for (const { code } of LANGUAGES) {
    const text = INTERFACE_STRINGS[code]?.previewHello ?? INTERFACE_STRINGS.en.previewHello;
    assert.doesNotMatch(text, /\{name\}/, `previewHello still uses {name} for ${code}`);
    assert.ok(text.length > 5, `previewHello missing for ${code}`);
  }
});

test('Russian previewHello is translated', () => {
  assert.equal(translate('previewHello', 'ru'), 'Здравствуйте, чем могу помочь сегодня?');
});
