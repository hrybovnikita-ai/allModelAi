const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../app');

test('AI Learning Lab gateway (/api/ai/*)', async (t) => {
    await t.test('GET /api/ai/lessons returns catalog or 503 when Python offline', async () => {
        const res = await request(app).get('/api/ai/lessons');
        if (res.status === 503 || res.status === 404) {
            assert.match(res.body.message || '', /unavailable|Python|failed|not found/i);
            return;
        }
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body.lessons));
    });

    await t.test('POST /api/ai/train/linear-regression requires auth', async () => {
        const res = await request(app)
            .post('/api/ai/train/linear-regression')
            .send({ epochs: 40, learning_rate: 0.05 });
        assert.equal(res.status, 401);
    });

    await t.test('POST /api/ai/predict validates body when authenticated', async () => {
        const email = `ailearn-${Date.now()}@example.com`;
        const signup = await request(app)
            .post('/api/auth/register')
            .send({ name: 'AI Learn', email, password: 'Password123!' });
        const cookie = signup.headers['set-cookie'];

        const bad = await request(app)
            .post('/api/ai/predict')
            .set('Cookie', cookie)
            .send({ x: [], weight: 1, bias: 0 });
        assert.equal(bad.status, 400);

        const train = await request(app)
            .post('/api/ai/train/linear-regression')
            .set('Cookie', cookie)
            .send({ epochs: 50, learning_rate: 0.05, seed: 42, data_points: 40 });
        if (train.status === 503 || train.status === 404) {
            assert.ok(train.body.message);
            return;
        }
        assert.equal(train.status, 200);
        assert.equal(train.body.ok, true);
        assert.ok(train.body.trainingId);

        const predict = await request(app)
            .post('/api/ai/predict')
            .set('Cookie', cookie)
            .send({
                x: [0, 1],
                weight: train.body.finalWeight,
                bias: train.body.finalBias,
            });
        assert.equal(predict.status, 200);
        assert.ok(Array.isArray(predict.body.predictions));
    });
});
