import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

test('CommandPalette declares hooks before any conditional return', async () => {
  const source = await readFile(
    new URL('../src/components/CommandPalette/CommandPalette.jsx', import.meta.url),
    'utf8',
  );
  const returnNullIdx = source.indexOf('if (!paletteAllowed)');
  assert.ok(returnNullIdx > 0, 'expected paletteAllowed guard');
  const hookSlice = source.slice(0, returnNullIdx);
  assert.match(hookSlice, /useEffect\(/);
  assert.match(hookSlice, /useMemo\(/);
  assert.doesNotMatch(hookSlice, /if \(!paletteAllowed\) return null/);
});
