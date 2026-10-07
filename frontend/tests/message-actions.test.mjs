import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

test('MessageActions module exists and Chat integrates toolbar', () => {
  const actions = readFileSync(`${root}src/components/Chat/MessageActions.jsx`, 'utf8');
  assert.match(actions, /role="toolbar"/);
  assert.match(actions, /message-actions-assistant/);
  assert.match(actions, /Regenerate response/);
  assert.match(actions, /import \* as ActionIcons from '\.\/MessageActionIcons'/);
  const menu = readFileSync(`${root}src/components/Chat/MoreActionsMenu.jsx`, 'utf8');
  assert.match(menu, /createPortal/);
  assert.match(menu, /message-more-menu-item/);
  const chat = readFileSync(`${root}src/components/Chat/Chat.jsx`, 'utf8');
  assert.match(chat, /import MessageActions from '\.\/MessageActions'/);
  assert.match(chat, /<MessageActions/);
  assert.doesNotMatch(chat, /CopyMessageIcon/);
});

test('MessageActionIcons exports every icon used by MessageActions', () => {
  const iconsSource = readFileSync(`${root}src/components/Chat/MessageActionIcons.jsx`, 'utf8');
  const actionsSource = readFileSync(`${root}src/components/Chat/MessageActions.jsx`, 'utf8');
  const destructured = actionsSource.match(/const \{\s*([\s\S]*?)\s*\} = ActionIcons;/);
  assert.ok(destructured, 'MessageActions should destructure icons from ActionIcons');
  const names = destructured[1]
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  for (const name of names) {
    assert.match(
      iconsSource,
      new RegExp(`export function ${name}\\(`),
      `${name} must be exported from MessageActionIcons.jsx`,
    );
  }
  assert.ok(names.includes('IconBookmark'), 'IconBookmark is required for Save in More menu');
});

test('clipboard helper is shared', () => {
  const lib = readFileSync(`${root}src/lib/clipboard.js`, 'utf8');
  assert.match(lib, /export async function copyToClipboard/);
});
