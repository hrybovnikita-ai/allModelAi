import assert from 'node:assert/strict';
import { test } from 'node:test';
import { splitMessageParts } from '../src/lib/splitMessageParts.js';

test('preserves Python indentation and newlines inside fenced blocks', () => {
  const text = [
    'Here is a function:',
    '```python',
    'def fibonacci(n):',
    '    if n <= 1:',
    '        return n',
    '    return fibonacci(n - 1) + fibonacci(n - 2)',
    '```',
    'Done.',
  ].join('\n');
  const parts = splitMessageParts(text);
  const code = parts.find((part) => part.type === 'code');
  assert.ok(code);
  assert.equal(code.language, 'python');
  assert.match(code.value, /^def fibonacci\(n\):/);
  assert.match(code.value, /\n {4}if n <= 1:/);
  assert.match(code.value, /\n {8}return n/);
  assert.equal(code.value.includes('    if n'), true);
});

test('preserves JavaScript, JSON, and Markdown fences', () => {
  const js = splitMessageParts('```js\nconst x = 1;\n  const y = 2;\n```').find((p) => p.type === 'code');
  assert.equal(js.language, 'js');
  assert.match(js.value, /\n {2}const y = 2;/);

  const json = splitMessageParts('```json\n{\n  "a": 1\n}\n```').find((p) => p.type === 'code');
  assert.match(json.value, /\n {2}"a": 1/);

  const md = splitMessageParts('```markdown\n# Title\n\n- item\n```').find((p) => p.type === 'code');
  assert.match(md.value, /^# Title\n\n- item$/);
});

test('accepts language tag without newline before code', () => {
  const parts = splitMessageParts('```python def hello():\n    return 1\n```');
  const code = parts.find((part) => part.type === 'code');
  assert.ok(code);
  assert.equal(code.language, 'python');
  assert.match(code.value, /def hello\(\):/);
  assert.match(code.value, /\n {4}return 1/);
});

test('keeps explanation after a closed python fence', () => {
  const text = 'Intro\n```python\nprint(1)\n```\n\n### How to run\npython game.py\n';
  const parts = splitMessageParts(text);
  assert.equal(parts.filter((part) => part.type === 'code').length, 1);
  assert.match(parts.filter((part) => part.type === 'text').map((part) => part.value).join('\n'), /How to run/);
  assert.match(parts.filter((part) => part.type === 'text').map((part) => part.value).join('\n'), /python game.py/);
});

test('pulls a heading left inside an unclosed fence into text', () => {
  const text = '```python\nprint("ship")\n\n### How it works\nThe loop moves the player.\n';
  const parts = splitMessageParts(text);
  const code = parts.find((part) => part.type === 'code');
  const textPart = parts.filter((part) => part.type === 'text').map((part) => part.value).join('\n');
  assert.match(code.value, /print\("ship"\)/);
  assert.doesNotMatch(code.value, /How it works/);
  assert.match(textPart, /How it works/);
});

test('keeps two separate code blocks', () => {
  const text = '```html\n<div></div>\n```\n```css\nbody{}\n```\nDone';
  const codes = splitMessageParts(text).filter((part) => part.type === 'code');
  assert.equal(codes.length, 2);
  assert.equal(codes[0].language, 'html');
  assert.equal(codes[1].language, 'css');
});

