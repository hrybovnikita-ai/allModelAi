const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyChatIntent } = require('../src/services/chatIntent');

const cases = [
    {
        prompt: 'Find me interesting books for learning Python',
        expect: { coding: false, webSearch: true, recommendation: true },
    },
    {
        prompt: 'Best websites to learn JavaScript',
        expect: { coding: false, webSearch: true, recommendation: true },
    },
    {
        prompt: 'What is React?',
        expect: { coding: false, informational: true },
    },
    {
        prompt: 'Compare Python and Java',
        expect: { coding: false, comparison: true },
    },
    {
        prompt: 'Write a Python function that sorts an array',
        expect: { coding: true, primary: 'coding' },
    },
    {
        prompt: 'Create a React login component',
        expect: { coding: true, primary: 'coding' },
    },
    {
        prompt: 'Fix this JavaScript code',
        expect: { coding: true, primary: 'coding' },
    },
    {
        prompt: 'Find the official Python documentation',
        expect: { coding: false, webSearch: true },
    },
];

test('chat intent classification', () => {
    for (const { prompt, expect } of cases) {
        const intent = classifyChatIntent(prompt);
        if (Object.prototype.hasOwnProperty.call(expect, 'coding')) {
            assert.equal(intent.coding, expect.coding, `coding mismatch for: ${prompt}`);
        }
        if (Object.prototype.hasOwnProperty.call(expect, 'webSearch')) {
            assert.equal(intent.webSearch, expect.webSearch, `webSearch mismatch for: ${prompt}`);
        }
        if (Object.prototype.hasOwnProperty.call(expect, 'recommendation')) {
            assert.equal(intent.recommendation, expect.recommendation, `recommendation mismatch for: ${prompt}`);
        }
        if (Object.prototype.hasOwnProperty.call(expect, 'informational')) {
            assert.equal(intent.informational, expect.informational, `informational mismatch for: ${prompt}`);
        }
        if (Object.prototype.hasOwnProperty.call(expect, 'comparison')) {
            assert.equal(intent.comparison, expect.comparison, `comparison mismatch for: ${prompt}`);
        }
        if (expect.primary) {
            assert.equal(intent.primary, expect.primary, `primary mismatch for: ${prompt}`);
        }
    }
});
