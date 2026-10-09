const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../app');
const { validateLabTrainBody, MAX_EPOCHS } = require('../src/services/aiTrainingValidation');
const { tutorAvailability } = require('../src/services/aiTrainingTutorService');

test('AI Training Phase 1 APIs', async (t) => {
    await t.test('validateLabTrainBody rejects invalid epochs', () => {
        const bad = validateLabTrainBody({ epochs: MAX_EPOCHS + 1, learningRate: 0.01 });
        assert.equal(bad.ok, false);
        const good = validateLabTrainBody({ epochs: 100, learningRate: 0.01 });
        assert.equal(good.ok, true);
    });

    await t.test('GET /api/ai-training/lessons returns catalog', async () => {
        const res = await request(app).get('/api/ai-training/lessons');
        if (res.status === 503) {
            assert.match(res.body.message || '', /unavailable|Python/i);
            return;
        }
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body.lessons));
        assert.ok(res.body.lessons.some((l) => l.id === 'linear-regression'));
        assert.ok(typeof res.body.phase === 'number' && res.body.phase >= 1);
    });

    await t.test('GET /api/ai-training/tutor/status does not crash without OpenAI', async () => {
        const res = await request(app).get('/api/ai-training/tutor/status');
        assert.equal(res.status, 200);
        assert.equal(typeof res.body.available, 'boolean');
        tutorAvailability();
    });

    await t.test('POST train requires auth and validates body', async () => {
        const res = await request(app)
            .post('/api/ai-training/linear-regression/train')
            .send({ epochs: 50, learningRate: 0.01 });
        assert.equal(res.status, 401);

        const email = `aitrain-${Date.now()}@example.com`;
        const signup = await request(app)
            .post('/api/auth/register')
            .send({ name: 'Train User', email, password: 'Password123!' });
        const cookie = signup.headers['set-cookie'];

        const invalid = await request(app)
            .post('/api/ai-training/gradient-descent/train')
            .set('Cookie', cookie)
            .send({ epochs: 999999, learningRate: 0.01 });
        assert.equal(invalid.status, 400);

        const train = await request(app)
            .post('/api/ai-training/linear-regression/train')
            .set('Cookie', cookie)
            .send({ epochs: 200, learningRate: 0.01, initialWeight: 0, initialBias: 0 });
        if (train.status === 503) {
            assert.ok(train.body.message);
            return;
        }
        assert.equal(train.status, 200);
        assert.equal(train.body.ok, true);
        assert.ok(Array.isArray(train.body.history));
        assert.ok(train.body.finalLoss < train.body.history[0].loss);

        const experiments = await request(app)
            .get('/api/ai-training/experiments')
            .set('Cookie', cookie);
        assert.equal(experiments.status, 200);
        assert.ok(experiments.body.experiments.length >= 1);
    });

    await t.test('POST /api/ai-training/tutor returns unavailable or answer without throwing', async () => {
        const email = `tutor-${Date.now()}@example.com`;
        const signup = await request(app)
            .post('/api/auth/register')
            .send({ name: 'Tutor User', email, password: 'Password123!' });
        const cookie = signup.headers['set-cookie'];
        const res = await request(app)
            .post('/api/ai-training/tutor')
            .set('Cookie', cookie)
            .send({ message: 'What is MSE?', lessonContext: { title: 'Linear Regression' } });
        assert.ok([200, 502, 503].includes(res.status));
    });
});
