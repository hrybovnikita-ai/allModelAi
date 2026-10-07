const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.DEVELOPER_EMAILS = 'clarify@example.com';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-dr-clarify-${process.pid}.sqlite`);
process.env.API_KEY = 'test-key';
process.env.GEMINI_API_KEY = 'test-gemini';
fs.rmSync(process.env.DB_FILE, { force: true });

const app = require('../app');
const { scoreSpecificity } = require('../src/services/deepResearch/clarification');

let api;

describe('Deep Research clarification', () => {
    before(async () => {
        api = request.agent(app);
        await api.post('/api/auth/register').send({
            name: 'Clarify',
            email: 'clarify@example.com',
            password: 'test-password',
        });
    });

    after(() => {
        app.locals.db.close();
    });

    test('specific compare query skips clarification', () => {
        const score = scoreSpecificity(
            'Compare Python 3.14 performance with Python 3.13 using official documentation and benchmarks.',
        );
        assert.ok(score >= 3);
    });

    test('broad senior Python books query may need clarification', async () => {
        const response = await api.post('/api/research/clarify').send({
            query: 'Найти мне лучшие книги по изучению Python если я уже senior разработчик',
        });
        assert.equal(response.status, 200);
        assert.equal(typeof response.body.needsClarification, 'boolean');
        assert.ok(Array.isArray(response.body.questions));
    });
});
