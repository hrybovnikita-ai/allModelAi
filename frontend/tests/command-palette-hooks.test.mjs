import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

test('CommandPaletteAuthenticated declares hooks before UI branches', async () => {
  const source = await readFile(
    new URL('../src/components/CommandPalette/CommandPalette.jsx', import.meta.url),
    'utf8',
  );
  const innerStart = source.indexOf('function CommandPaletteAuthenticated()');
  assert.ok(innerStart > 0, 'expected CommandPaletteAuthenticated');
  const innerSlice = source.slice(innerStart);
  const branchIdx = innerSlice.indexOf('if (!open)');
  assert.ok(branchIdx > 0);
  const hookSlice = innerSlice.slice(0, branchIdx);
  assert.match(hookSlice, /useEffect\(/);
  assert.match(hookSlice, /useMemo\(/);
});

test('CommandPalette gate returns null before mounting authenticated UI', async () => {
  const source = await readFile(
    new URL('../src/components/CommandPalette/CommandPalette.jsx', import.meta.url),
    'utf8',
  );
  const gateStart = source.indexOf('export default function CommandPalette()');
  const gateSlice = source.slice(gateStart);
  assert.match(gateSlice, /if \(!paletteAllowed\)[\s\S]*return null/);
  assert.match(gateSlice, /CommandPaletteAuthenticated/);
});
