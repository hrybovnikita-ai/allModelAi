const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

test('dedicated TTS router exposes /health without auth', async () => {
  const ttsRouter = require('../src/routes/api/tts');
  const app = express();
  app.use('/api/tts', ttsRouter);

  const res = await request(app).get('/api/tts/health');
  assert.notEqual(res.status, 404);
  assert.ok([200, 503].includes(res.status));
  assert.equal(res.body.service, 'allmodelai-tts');
  assert.equal(typeof res.body.providers?.kokoro, 'boolean');
});

test('dedicated TTS router keeps /catalog behind auth', async () => {
  const ttsRouter = require('../src/routes/api/tts');
  const app = express();
  app.use(express.json());
  app.use('/api/tts', ttsRouter);

  const res = await request(app).get('/api/tts/catalog');
  assert.equal(res.status, 401);
});

test('TTS router stack includes health and speak paths', () => {
  const ttsRouter = require('../src/routes/api/tts');
  const paths = [];
  for (const layer of ttsRouter.stack || []) {
    if (layer.route?.path) {
      const methods = Object.keys(layer.route.methods || {}).join(',').toUpperCase();
      paths.push(`${methods} ${layer.route.path}`);
    }
  }
  assert.ok(paths.some((p) => /GET\s+\/health/.test(p)), `missing /health in ${paths.join(' | ')}`);
  assert.ok(paths.some((p) => /POST\s+\/speak/.test(p)), `missing /speak in ${paths.join(' | ')}`);
  assert.ok(paths.some((p) => /GET\s+\/catalog/.test(p)), `missing /catalog in ${paths.join(' | ')}`);
});
