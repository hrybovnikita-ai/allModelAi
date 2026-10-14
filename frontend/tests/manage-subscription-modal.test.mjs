import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Manage subscription modal is portaled with visible stacking', () => {
  const jsx = readFileSync(
    path.join(root, 'src/components/Dashboard/ManageSubscriptionModal.jsx'),
    'utf8',
  );
  const css = readFileSync(
    path.join(root, 'src/components/Dashboard/ManageSubscriptionModal.css'),
    'utf8',
  );
  const dashboard = readFileSync(
    path.join(root, 'src/components/Dashboard/Dashboard.jsx'),
    'utf8',
  );

  assert.match(jsx, /createPortal/);
  assert.match(jsx, /document\.body/);
  assert.match(jsx, /aria-modal="true"/);
  assert.match(jsx, /event\.key === 'Escape'/);
  assert.match(jsx, /Manage subscription/);
  assert.match(jsx, /dashboard-modal-close/);

  assert.match(css, /\.dashboard-modal-backdrop[\s\S]*z-index:\s*1200/);
  assert.match(css, /\.dashboard-modal[\s\S]*opacity:\s*1/);
  assert.match(css, /\.dashboard-modal[\s\S]*visibility:\s*visible/);
  assert.match(css, /place-items:\s*center/);

  assert.match(dashboard, /ManageSubscriptionModal/);
  assert.match(dashboard, /setManageSubOpen\(true\)/);
});
