import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('dashboard main column is full width without permanent sidebar grid', async () => {
  const css = await readFile(path.join(root, 'src/components/Dashboard/DashboardPremium.css'), 'utf8');
  assert.match(css, /\.dashboard-page--premium\s*\{[^}]*display:\s*block/s);
  assert.doesNotMatch(css, /grid-template-columns:\s*256px minmax\(0, 1fr\)/);
});

test('navbar glass bar spans full width without centered max-width shell', async () => {
  const css = await readFile(path.join(root, 'src/components/Navigation/FloatingGlassNav.css'), 'utf8');
  assert.match(css, /min-height: 64px/);
  assert.match(css, /fg-nav-menu-btn/);
  assert.doesNotMatch(css, /width: var\(--app-content-width/);
});

test('dashboard shell uses full width beside the sidebar', async () => {
  const css = await readFile(path.join(root, 'src/components/Dashboard/DashboardShellLayout.css'), 'utf8');
  assert.match(css, /max-width: none/);
  assert.match(css, /dashboard-insights-grid/);
});

test('dashboard shell is left-aligned after the sidebar', async () => {
  const css = await readFile(path.join(root, 'src/components/Dashboard/DashboardSaas.css'), 'utf8');
  assert.match(css, /margin-left: 0 !important/);
  assert.match(css, /max-width: none !important/);
});
