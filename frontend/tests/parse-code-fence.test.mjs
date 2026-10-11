import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFenceHeader, defaultFilenameForLanguage } from '../src/lib/parseCodeFence.js';

test('parseFenceHeader extracts language and filename', () => {
  assert.deepEqual(parseFenceHeader('python:main.py'), { language: 'python', filename: 'main.py' });
  assert.deepEqual(parseFenceHeader('javascript'), { language: 'javascript', filename: null });
  assert.deepEqual(parseFenceHeader(''), { language: 'text', filename: null });
});

test('parseFenceHeader sanitizes path segments', () => {
  const parsed = parseFenceHeader('tsx:src/components/App.tsx');
  assert.equal(parsed.filename, 'App.tsx');
});

test('defaultFilenameForLanguage maps common langs', () => {
  assert.equal(defaultFilenameForLanguage('python'), 'main.py');
  assert.equal(defaultFilenameForLanguage('jsx'), 'App.jsx');
});
