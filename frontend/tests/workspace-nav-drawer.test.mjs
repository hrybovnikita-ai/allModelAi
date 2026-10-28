import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('header exposes hamburger menu for workspace drawer', async () => {
  const source = await readFile(
    path.join(root, 'src/components/Navigation/FloatingGlassNav.jsx'),
    'utf8',
  );
  assert.match(source, /fg-nav-menu-btn/);
  assert.match(source, /aria-controls="workspace-nav-drawer"/);
  assert.match(source, /useWorkspaceNavDrawer/);
});

test('dashboard page does not mount permanent sidebar', async () => {
  const source = await readFile(
    path.join(root, 'src/components/Dashboard/Dashboard.jsx'),
    'utf8',
  );
  assert.doesNotMatch(source, /DashboardSidebar/);
});

test('insights grid uses non-overlapping columns', async () => {
  const css = await readFile(
    path.join(root, 'src/components/Dashboard/DashboardShellLayout.css'),
    'utf8',
  );
  assert.match(css, /dashboard-insights-grid/);
  assert.match(css, /minmax\(0,\s*min\(400px,\s*38%\)\)\s+minmax\(0,\s*1fr\)/);
  assert.match(css, /grid-template-columns:\s*none !important/);
});

test('drawer supports escape and backdrop close', async () => {
  const source = await readFile(
    path.join(root, 'src/components/Navigation/WorkspaceNavDrawer.jsx'),
    'utf8',
  );
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /workspace-nav-backdrop/);
});
