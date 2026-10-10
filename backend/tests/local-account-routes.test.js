const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.NODE_ENV = 'test';

test('local app exposes account security routes (not 404)', async () => {
  const app = require('../localApp');
  const security = await request(app).get('/api/auth/account/security');
  assert.notEqual(security.status, 404, 'account/security must be registered');
  assert.equal(security.status, 401);

  const password = await request(app).post('/api/auth/account/password').send({
    newPassword: 'test-password-1',
    confirmPassword: 'test-password-1',
  });
  assert.notEqual(password.status, 404, 'account/password must be registered');
  assert.equal(password.status, 401);
});
