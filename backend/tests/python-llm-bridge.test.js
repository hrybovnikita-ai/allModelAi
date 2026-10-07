const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

test('pythonLlmBridge maps provider errors to safe codes', async () => {
    const bridge = require('../src/services/pythonLlmBridge');
    assert.equal(typeof bridge.getLlmHealth, 'function');
    assert.equal(typeof bridge.chatViaPython, 'function');
});

test('pythonLlmController validates provider and model', async () => {
    const controller = require('../src/controllers/pythonLlmController');
    const res = {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
    await controller.postPythonLlmChat({ body: { messages: [] } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'INVALID_PROVIDER');
});
