import test from 'node:test';
import assert from 'node:assert/strict';
import { splitRichTextSegments } from '../src/lib/chatMessageLinks.js';

test('splitRichTextSegments parses markdown links', () => {
  const segments = splitRichTextSegments('See [Python Crash Course](https://nostarch.com/pythoncrashcourse) today.');
  assert.ok(segments.some((s) => s.type === 'link' && s.url.includes('nostarch.com')));
});

test('splitRichTextSegments parses bare URLs', () => {
  const segments = splitRichTextSegments('Docs: https://docs.python.org/3/');
  assert.ok(segments.some((s) => s.type === 'link' && s.url.includes('docs.python.org')));
});
