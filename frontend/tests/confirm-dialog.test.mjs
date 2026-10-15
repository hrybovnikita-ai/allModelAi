import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Chat.jsx uses ConfirmDialog instead of native window.confirm for deletions', () => {
  const chat = readFileSync(path.join(rootDir, 'src/components/Chat/Chat.jsx'), 'utf8');
  const dialog = readFileSync(
    path.join(rootDir, 'src/components/ConfirmDialog/ConfirmDialog.jsx'),
    'utf8',
  );
  const css = readFileSync(
    path.join(rootDir, 'src/components/ConfirmDialog/ConfirmDialog.css'),
    'utf8',
  );

  assert.match(dialog, /role="alertdialog"/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /createPortal/);
  assert.match(dialog, /Escape/);
  assert.match(dialog, /confirmLockRef/);
  assert.match(css, /\.confirm-dialog-backdrop/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /safe-area-inset/);

  assert.match(chat, /import ConfirmDialog from '\.\.\/ConfirmDialog\/ConfirmDialog'/);
  assert.match(chat, /requestDeleteConversation/);
  assert.match(chat, /performDeleteConversation/);
  assert.match(chat, /<ConfirmDialog/);
  assert.match(chat, /Delete chat\?/);
  assert.doesNotMatch(chat, /window\.confirm\(/);
  assert.match(chat, /requestDeleteProject/);
  assert.match(chat, /requestDeleteFeedQuestion/);
  assert.match(chat, /confirmInFlightRef/);
});
