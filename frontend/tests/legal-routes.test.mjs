import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = fs.readFileSync(path.join(frontendRoot, 'src/App.jsx'), 'utf8');
const infoSource = fs.readFileSync(path.join(frontendRoot, 'src/components/InfoPage/InfoPage.jsx'), 'utf8');

test('legal and support routes are registered', () => {
  const expected = [
    '/privacy',
    '/terms',
    '/refunds',
    '/acceptable-use',
    '/contact',
    '/cookies',
  ];
  for (const route of expected) {
    assert.match(appSource, new RegExp(`path="${route.replace('/', '\\/')}"`));
  }
});

test('InfoPage exposes legal copy keys and support email', () => {
  for (const type of ['privacy', 'terms', 'refund', 'aup', 'contact', 'cookies']) {
    assert.match(infoSource, new RegExp(`${type}:`));
  }
  assert.match(infoSource, /support@allmodelai\.com/);
  assert.match(infoSource, /NSFW/i);
  assert.match(infoSource, /Acceptable Use Policy/);
});
