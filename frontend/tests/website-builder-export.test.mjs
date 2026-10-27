import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('website export builds an installable Vite package', async () => {
  const source = await readFile(path.join(root, 'src/lib/websiteProject.js'), 'utf8');
  assert.match(source, /buildViteExportFiles/);
  assert.match(source, /package\.json/);
  assert.match(source, /vite/);
  assert.match(source, /README\.md/);
});

test('redesign route validates project files on the server', async () => {
  const source = await readFile(path.join(root, '../backend/src/appGeneration.js'), 'utf8');
  assert.match(source, /prepareWebsiteRedesign/);
  assert.match(source, /unsafe names/);
});
