const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../app');

test('PyTorch AI Learning Engine endpoints', async (t) => {
    await t.test('GET /api/ai-python/status returns PyTorch status and model state', async () => {
        const res = await request(app).get('/api/ai-python/status');
        assert.equal(res.status, 200);
        assert.ok(res.body.pytorch_version, 'Should return PyTorch version');
        assert.ok(res.body.device, 'Should return active device');
        assert.ok(Array.isArray(res.body.classes), 'Should list classes');
        assert.ok(typeof res.body.total_parameters === 'number', 'Should return parameter count');
    });

    await t.test('POST /api/ai-python/predict returns valid classification and response', async () => {
        // Register or login a user to get auth session for protected predict
        const email = `test-ai-${Date.now()}@example.com`;
        const signupRes = await request(app)
            .post('/api/auth/register')
            .send({ name: 'PyTorch Tester', email, password: 'Password123!' });
        assert.equal(signupRes.status, 201);
        const cookie = signupRes.headers['set-cookie'];

        const predictRes = await request(app)
            .post('/api/ai-python/predict')
            .set('Cookie', cookie)
            .send({ text: 'How does neural network learning work?' });

        assert.equal(predictRes.status, 200);
        assert.ok(predictRes.body.predicted_class, 'Should return predicted class');
        assert.ok(typeof predictRes.body.confidence === 'number', 'Should return confidence');
        assert.ok(predictRes.body.response, 'Should return synthesized response');
    });
});
