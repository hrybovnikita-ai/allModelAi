import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chatSource = fs.readFileSync(path.join(root, 'src/components/Chat/Chat.jsx'), 'utf8');
const cssSource = fs.readFileSync(path.join(root, 'src/components/Chat/ComposerModern.css'), 'utf8');

test('chat composer uses modern shell without separate mode row', () => {
  assert.match(chatSource, /chat-composer-modern/);
  assert.match(chatSource, /Ask AllModelAI anything\.\.\./);
  assert.doesNotMatch(chatSource, /composer-mode-bar/);
  assert.match(chatSource, /composer-input-row/);
  assert.match(chatSource, /role="menu"/);
});

test('plus menu includes chat modes and core tool actions', () => {
  const tools = [
    'Chat',
    'Create files',
    'Image',
    'Deep Research',
    'Voice mode',
    'Send screenshot / photo',
    'Attach files',
    'Make video',
    'Search the web',
    'Knowledge Base',
    'Continue last answer',
    'Branch conversation',
    'Save last answer',
  ];
  for (const label of tools) {
    assert.match(chatSource, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(chatSource, /composer-mode-pill/);
  assert.doesNotMatch(chatSource, /Create image \(generation\)/);
});

test('chat modes in plus menu wire to existing skill handlers', () => {
  assert.match(chatSource, /chooseSkill\('file'\)/);
  assert.match(chatSource, /toggleImageSkill/);
  assert.match(chatSource, /chooseSkill\('deep-research'\)/);
  assert.match(chatSource, /setSelectedSkill\(null\)/);
});

test('composer modern css defines scrollable menu and animation', () => {
  assert.match(cssSource, /composer-menu-divider/);
  assert.match(cssSource, /overflow-y: auto/);
  assert.match(cssSource, /--composer-radius: 28px/);
  assert.match(cssSource, /composer-menu-in/);
  assert.match(cssSource, /prefers-reduced-motion/);
  assert.doesNotMatch(cssSource, /composer-mode-pill/);
});
