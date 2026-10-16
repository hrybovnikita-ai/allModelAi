import test from 'node:test';
import assert from 'node:assert/strict';
import { splitChatSse } from '../src/lib/chatSse.js';

test('fallback metadata and response survive every network split including CRLF', () => {
  const wire = 'data:{"fallback":true,"actualModel":"ollama"}\r\n\r\ndata: {"text":"Привет"}\r\n\r\ndata: [DONE]\r\n\r\n';
  for (let index = 0; index <= wire.length; index++) {
    const first = splitChatSse(wire.slice(0, index));
    const second = splitChatSse(first.buffer + wire.slice(index), true);
    assert.deepEqual([...first.data, ...second.data].map(JSON.parse), [
      { fallback: true, actualModel: 'ollama' }, { text: 'Привет' },
    ]);
    assert.equal(second.buffer, '');
  }
});

test('EOF processes a final error instead of silently marking an empty response completed', () => {
  const partial = splitChatSse('data: {"error":"All providers unavailable"}');
  assert.deepEqual(partial.data, []);
  assert.deepEqual(splitChatSse(partial.buffer, true).data.map(JSON.parse), [
    { error: 'All providers unavailable' },
  ]);
});

test('supports multiline data and ignores comments and DONE', () => {
  const parsed = splitChatSse(': heartbeat\n\nevent: message\ndata: {"fallback":true,\ndata: "actualModel":"gemini"}\n\ndata:[DONE]\n\n');
  assert.deepEqual(parsed.data.map(JSON.parse), [{ fallback: true, actualModel: 'gemini' }]);
});
