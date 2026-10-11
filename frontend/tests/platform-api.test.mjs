import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

test('platformApi fetches capabilities endpoint', () => {
  const source = readFileSync(`${root}src/lib/platformApi.js`, 'utf8');
  assert.match(source, /\/api\/platform\/capabilities/);
});

test('Settings includes platform roadmap panel', () => {
  const settings = readFileSync(`${root}src/components/Settings/Settings.jsx`, 'utf8');
  assert.match(settings, /PlatformRoadmapPanel/);
});
