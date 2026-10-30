const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCodingResponseInstruction, wantsCodeOnly } = require('../src/services/codingResponseGuide');

test('coding guide asks for explanation unless the user wants code only', () => {
  const full = buildCodingResponseInstruction('Make me a Space Shooter game in Python.');
  assert.match(full, /How it works/);
  assert.match(full, /How to run/);
  assert.match(full, /Do not stop after the code block/);
  assert.equal(wantsCodeOnly('только код для игры'), true);
  const only = buildCodingResponseInstruction('python game, code only');
  assert.match(only, /code only/i);
  assert.doesNotMatch(only, /How it works/);
});
