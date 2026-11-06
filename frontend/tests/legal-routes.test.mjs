import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = fs.readFileSync(path.join(frontendRoot, 'src/App.jsx'), 'utf8');
const infoPageSource = fs.readFileSync(path.join(frontendRoot, 'src/components/InfoPage/InfoPage.jsx'), 'utf8');
const infoContentSource = fs.readFileSync(
  path.join(frontendRoot, 'src/components/InfoPage/infoPageContent.js'),
  'utf8',
);

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
  assert.match(infoPageSource, /from '\.\/infoPageContent\.js'/);
  for (const type of ['privacy', 'terms', 'refund', 'aup', 'contact', 'cookies']) {
    assert.match(infoContentSource, new RegExp(`${type}:`));
  }
  assert.match(infoContentSource, /support@allmodelai\.com/);
  assert.match(infoContentSource, /NSFW/i);
  assert.match(infoContentSource, /Acceptable Use Policy/);
});
