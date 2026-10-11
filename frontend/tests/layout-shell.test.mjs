import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('CommandPalette does not render floating ⌘ K button when closed', () => {
  const source = readFileSync(path.join(root, 'src/components/CommandPalette/CommandPalette.jsx'), 'utf8');
  assert.doesNotMatch(source, /className="command-fab"/);
  assert.match(source, /if \(!open\) \{\s*return null;/s);
});

test('design system defines shared app content width', () => {
  const css = readFileSync(path.join(root, 'src/styles/design-system.css'), 'utf8');
  assert.match(css, /--app-content-width/);
  assert.match(css, /--app-shell-max:\s*1600px/);
});

test('dashboard violet shell uses app content width', () => {
  const css = readFileSync(path.join(root, 'src/components/Dashboard/DashboardLayout.css'), 'utf8');
  assert.match(css, /var\(--app-content-width/);
  assert.match(css, /--app-shell-gutter/);
  assert.doesNotMatch(css, /padding:\s*0\s+5vw/);
});
