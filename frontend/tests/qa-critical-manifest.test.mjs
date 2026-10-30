import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(
  readFileSync(join(root, '..', 'qa', 'critical-frontend.tests.json'), 'utf8'),
);

test('critical frontend manifest lists existing test files', () => {
  assert.ok(Array.isArray(manifest.files) && manifest.files.length > 0);
  for (const name of manifest.files) {
    assert.match(name, /\.test\.mjs$/);
    const path = join(root, 'tests', name);
    assert.ok(existsSync(path), `missing critical test: ${name}`);
  }
});
