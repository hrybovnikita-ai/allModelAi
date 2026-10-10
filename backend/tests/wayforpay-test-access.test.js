const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

process.env.NODE_ENV = 'test';
process.env.WAYFORPAY_TEST_MODE = 'true';
process.env.WAYFORPAY_DOMAIN = 'checkout.example.com';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-wfp-access-${process.pid}.sqlite`);
fs.rmSync(process.env.DB_FILE, { force: true });

const app = require('../app');

async function registerAndCookie(email) {
    const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'WFP User', email, password: 'Password123!' });
    assert.equal(res.status, 201);
    return res.headers['set-cookie'];
}

test('WayForPay test checkout access', async (t) => {
    await t.test('test-checkout activates starter for signed-in user', async () => {
        const cookie = await registerAndCookie(`wfp-starter-${Date.now()}@example.com`);
        const res = await request(app)
            .post('/api/payments/wayforpay/test-checkout')
            .set('Cookie', cookie)
            .send({ plan: 'starter' });
        assert.equal(res.status, 200);
        assert.equal(res.body.paid, true);
        assert.equal(res.body.testMode, true);
        assert.equal(res.body.requestLimit, 800);
        const credits = await request(app).get('/api/credits').set('Cookie', cookie);
        assert.equal(credits.status, 200);
        assert.equal(credits.body.limit, 800);
    });
});
