const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeCode, detectLanguage } = require('../src/codeAssistant');

test('detects python and flags assignment in a condition without executing it', () => {
    const result = analyzeCode('if count = 1:\n    print(count)\n', 'python');
    assert.equal(result.executed, false);
    assert.equal(result.language, 'python');
    assert.ok(result.confirmed.some((item) => item.kind === 'syntax'));
});

test('flags python that shadows a built-in as a possible issue', () => {
    const result = analyzeCode('def len(items):\n    return 1\n', 'python');
    assert.equal(result.executed, false);
    assert.ok(result.possible.some((item) => item.kind === 'shadow-builtin'));
    assert.equal(result.confirmed.length, 0);
});

test('accepts valid javascript and rejects a syntax error', () => {
    const valid = analyzeCode('const value = 1;\nconsole.log(value);\n', 'javascript');
    assert.equal(valid.confirmed.length, 0);
    const invalid = analyzeCode('const value = ;\n', 'javascript');
    assert.ok(invalid.confirmed.some((item) => item.kind === 'syntax'));
    assert.equal(invalid.executed, false);
});

test('recognizes several languages from the snippet', () => {
    assert.equal(detectLanguage('SELECT id FROM users'), 'sql');
    assert.equal(detectLanguage('#include <stdio.h>\nint main(){return 0;}'), 'c');
    assert.equal(detectLanguage('public class Demo { }'), 'java');
});

test('rejects empty code', () => {
    assert.throws(() => analyzeCode('   '), /Code is required/);
});
