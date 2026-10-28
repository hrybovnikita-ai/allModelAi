import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('dashboard action buttons use full pill radius', async () => {
  const css = await readFile(
    path.join(root, 'src/components/Dashboard/DashboardButtons.css'),
    'utf8',
  );
  assert.match(css, /--dash-btn-radius:\s*9999px/);
  assert.match(css, /border-radius:\s*var\(--dash-btn-radius\)\s*!important/);
  assert.match(css, /\.dashboard-action-primary/);
  assert.match(css, /\.dashboard-banner-links a/);
  assert.match(css, /\.model-open/);
});

test('Dashboard.jsx loads dashboard button styles last', async () => {
  const source = await readFile(
    path.join(root, 'src/components/Dashboard/Dashboard.jsx'),
    'utf8',
  );
  const buttonsIdx = source.indexOf("import './DashboardButtons.css'");
  const shellIdx = source.indexOf("import './DashboardShellLayout.css'");
  assert.ok(buttonsIdx > shellIdx, 'DashboardButtons.css should load after shell layout CSS');
});
