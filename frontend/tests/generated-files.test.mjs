import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGeneratedFile, findGeneratedFile } from '../src/lib/generatedFiles.js';
const artifact = { type: 'allmodelai-file', title: 'My Python script', name: 'hello.py', content: 'print("Hello")\n' };

test('parses generated text/code and preserves exact whitespace', () => {
  const file = parseGeneratedFile(JSON.stringify(artifact));
  assert.equal(file.content, artifact.content);
  assert.equal(file.name, artifact.name);
  assert.equal(file.title, artifact.title);
  assert.deepEqual(parseGeneratedFile('```json\n' + JSON.stringify(artifact) + '\n```'), file);
});

test('rejects incomplete, malformed, binary and unrelated output', () => {
  for (const value of [null, 'hello', '{"type":"allmodelai-file"', JSON.stringify({ ...artifact, content: {} }), JSON.stringify({ ...artifact, type: 'other' }), JSON.stringify({ ...artifact, name: 'report.pdf' }), JSON.stringify({ ...artifact, content: '' })]) {
    assert.equal(parseGeneratedFile(value), null);
  }
});

test('sanitizes paths and unsafe filename characters', () => {
  assert.equal(parseGeneratedFile(JSON.stringify({ ...artifact, name: '../../hello.py' })).name, 'hello.py');
  assert.equal(parseGeneratedFile(JSON.stringify({ ...artifact, name: 'C:\\folder\\hello.py' })).name, 'hello.py');
  assert.equal(parseGeneratedFile(JSON.stringify({ ...artifact, name: 'hello?.py' })).name, 'hello_.py');
});

test('file links survive message normalization and never select user text', () => {
  const source = JSON.stringify(artifact);
  const file = parseGeneratedFile(source);
  assert.deepEqual(findGeneratedFile({ messages: [{ role: 'assistant', content: source }] }, file.id), file);
  assert.deepEqual(findGeneratedFile({ messages: [{ role: 'assistant', text: source }] }, file.id), file);
  assert.equal(findGeneratedFile({ messages: [{ role: 'user', content: source }] }, file.id), null);
  assert.equal(findGeneratedFile({ messages: [] }, file.id), null);
  assert.notEqual(parseGeneratedFile(JSON.stringify({ ...artifact, content: 'changed' })).id, file.id);
});
