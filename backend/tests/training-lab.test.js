const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.NODE_ENV = 'test';

const app = require('../app');
const { validateModelLabStartBody, validateModelLabPredictBody } = require('../src/services/aiTrainingValidation');

test('Model Lab validation', async (t) => {
    await t.test('rejects invalid modelType', () => {
        const r = validateModelLabStartBody({ modelType: 'gpt-5', epochs: 10 });
        assert.equal(r.ok, false);
    });
    await t.test('accepts linear-regression payload', () => {
        const r = validateModelLabStartBody({ modelType: 'linear-regression', epochs: 50, learningRate: 0.01, batchSize: 16 });
        assert.equal(r.ok, true);
        assert.equal(r.payload.modelType, 'linear-regression');
    });
    await t.test('predict inputs validation', () => {
        assert.equal(validateModelLabPredictBody({ inputs: [1, 2] }).ok, true);
        assert.equal(validateModelLabPredictBody({ inputs: [] }).ok, false);
    });
});

test('Training API auth', async (t) => {
    await t.test('POST /api/training/start requires auth', async () => {
        const res = await request(app).post('/api/training/start').send({ modelType: 'linear-regression', epochs: 10 });
        assert.equal(res.status, 401);
    });
});
