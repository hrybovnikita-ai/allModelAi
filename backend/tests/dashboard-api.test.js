const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const { hashPassword } = require('../src/password');

process.env.NODE_ENV = 'test';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'allmodelai-dashboard-api-'));
process.env.DB_FILE = path.join(directory, 'database.sqlite');
const app = require('../app');

after(() => {
    app.locals.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
});

async function registerAndLogin(email, password) {
    await request(app).post('/api/auth/register').send({
        name: 'Dashboard User',
        email,
        password,
        rememberMe: true,
    });
    const login = await request(app).post('/api/auth/login').send({ email, password, rememberMe: true });
    assert.equal(login.status, 200);
    return login.headers['set-cookie'][0].split(';')[0];
}

test('free user subscription and credits return complete payloads', async () => {
    const password = 'DashboardApi123!';
    const email = 'dashboard-free@example.com';
    const cookie = await registerAndLogin(email, password);

    const subscription = await request(app).get('/api/subscription').set('Cookie', cookie);
    assert.equal(subscription.status, 200);
    assert.equal(typeof subscription.body.remaining, 'number');
    assert.equal(subscription.body.subscriptionStatus, 'free');
    assert.equal(subscription.body.hasSubscription, false);

    const credits = await request(app).get('/api/credits').set('Cookie', cookie);
    assert.equal(credits.status, 200);
    assert.equal(typeof credits.body.remaining, 'number');
    assert.deepEqual(credits.body.models, subscription.body.models);
});

test('authenticated dashboard endpoints respond without hanging', async () => {
    const password = 'DashboardEndpoints123!';
    const email = 'dashboard-endpoints@example.com';
    const cookie = await registerAndLogin(email, password);

    const history = await request(app).get('/api/chat/history').set('Cookie', cookie);
    assert.equal(history.status, 200);
    assert.ok(Array.isArray(history.body));

    const models = await request(app).get('/api/status/models');
    assert.equal(models.status, 200);
    assert.ok(models.body.models);

    const suggestions = await request(app)
        .post('/api/chat/suggestions')
        .set('Cookie', cookie)
        .send({ lastMessage: 'Explain React hooks' });
    assert.equal(suggestions.status, 200);
    assert.equal(suggestions.body.suggestions.length, 3);
});

test('revertToFreePlan avoids full database.write on PostgreSQL mode', () => {
    process.env.DATABASE_URL = 'postgresql://example.invalid/db';
    delete require.cache[require.resolve('../src/db/provider')];
    delete require.cache[require.resolve('../src/billing/subscriptionLifecycle')];
    const { revertToFreePlan } = require('../src/billing/subscriptionLifecycle');

    let writeCalls = 0;
    let readCalls = 0;
    const database = {
        read: () => {
            readCalls += 1;
            return { subscriptions: {}, usage: {} };
        },
        write: () => {
            writeCalls += 1;
        },
        database: {
            prepare() {
                return { run: () => ({ changes: 1 }) };
            },
        },
    };

    revertToFreePlan(database, 'user@example.com', { status: 'expired' });
    assert.equal(writeCalls, 0);
    assert.equal(readCalls, 0);
    delete process.env.DATABASE_URL;
    delete require.cache[require.resolve('../src/db/provider')];
});

test('persistent remember-me cookie includes Max-Age', async () => {
    const password = 'RememberMe123!';
    const email = 'remember-me@example.com';
    const login = await request(app).post('/api/auth/register').send({
        name: 'Remember Me',
        email,
        password,
        rememberMe: true,
    });
    assert.equal(login.status, 201);
    assert.match(login.headers['set-cookie'][0], /Max-Age=/);
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    const session = await request(app).get('/api/auth/session').set('Cookie', cookie);
    assert.equal(session.status, 200);
    assert.equal(session.body.user.email, email);
});
