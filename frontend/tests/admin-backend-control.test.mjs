import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));

test('Admin page implements Backend Control Center tabs and ops endpoints', () => {
  const src = readFileSync(`${root}src/components/Admin/Admin.jsx`, 'utf8');
  assert.match(src, /Backend Control Center/);
  assert.match(src, /\/api\/admin\/ops\/dashboard/);
  assert.match(src, /\/api\/admin\/ops\/providers/);
  assert.match(src, /admin-provider-grid/);
});
