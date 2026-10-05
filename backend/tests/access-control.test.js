const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const {
    applyOwnerAccess,
    checkUsageLimit,
    hasModelAccess,
    isOwner,
    resolveOpenRouterModelId,
} = require('../src/billing/accessControl');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-access-${process.pid}-${Date.now()}.sqlite`);
process.env.GEMINI_API_KEY = 'test-gemini';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';

const app = require('../app');

test('owner bypasses application usage limits', () => {
    const owner = applyOwnerAccess({
        plan: 'free',
        limit: 10,
        used: 10,
        remaining: 0,
        enforced: true,
        models: ['gemini'],
    }, 'owner');
    assert.equal(isOwner(owner), true);
    assert.equal(checkUsageLimit(owner).allowed, true);
    assert.equal(hasModelAccess(owner, 'claude'), true);
});

test('free users remain limited and cannot access premium models', () => {
    const freeUser = applyOwnerAccess({
        plan: 'free',
        limit: 100,
        used: 100,
        remaining: 0,
        enforced: true,
        models: ['smart', 'gemini', 'gpt'],
        planDisplayName: 'Free',
    }, 'user');
    assert.equal(checkUsageLimit(freeUser).allowed, false);
    assert.equal(hasModelAccess(freeUser, 'claude'), false);
    assert.equal(hasModelAccess(freeUser, 'gemini'), true);
});

test('resolveOpenRouterModelId uses openrouter/free for Smart Router on free plan', () => {
    const freeAccess = { plan: 'free', isOwner: false };
    const model = resolveOpenRouterModelId({
        access: freeAccess,
        requestedModel: 'smart',
        routedModel: 'gemini',
        gatewayModel: 'google/gemini-2.5-flash',
        usesDirectProvider: false,
    });
    assert.equal(model, 'openrouter/free');
});

test('resolveOpenRouterModelId keeps explicit gateway ids for free plan', () => {
    const model = resolveOpenRouterModelId({
        access: { plan: 'free', isOwner: false },
        requestedModel: 'qwen',
        routedModel: 'qwen',
        gatewayModel: 'qwen/qwen3-coder',
        usesDirectProvider: false,
    });
    assert.equal(model, 'qwen/qwen3-coder');
});

test('owner keeps paid gateway model ids on OpenRouter', () => {
    const model = resolveOpenRouterModelId({
        access: { plan: 'free', isOwner: true },
        routedModel: 'gemini',
        gatewayModel: 'google/gemini-2.5-flash',
        usesDirectProvider: false,
    });
    assert.equal(model, 'google/gemini-2.5-flash');
});

test('request body cannot grant owner access', async () => {
    const agent = request.agent(app);
    const registered = await agent.post('/api/auth/register').send({
        name: 'Regular User',
        email: 'regular-access@example.com',
        password: 'regular-access-password',
    });
    assert.equal(registered.status, 201);
    const credits = await agent.get('/api/credits');
    assert.equal(credits.status, 200);
    assert.notEqual(credits.body.role, 'owner');
    assert.equal(credits.body.isOwner, false);

    await agent.post('/api/chat').send({
        model: 'smart',
        role: 'owner',
        plan: 'premium',
        temporary: true,
        messages: [{ role: 'user', content: 'hello' }],
    });
    const after = await agent.get('/api/credits');
    assert.equal(after.body.isOwner, false);
    assert.notEqual(after.body.role, 'owner');
});

test('credits API never exposes OpenRouter API keys', async () => {
    process.env.ALLMODELAI_OPENROUTER_API_KEY = 'sk-live-dedicated-openrouter-secret';
    process.env.OPENROUTER_API_KEY = 'sk-live-openrouter-secret';
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({
        name: 'Secret Scan',
        email: 'secret-scan@example.com',
        password: 'secret-scan-password',
    });
    const credits = await agent.get('/api/credits');
    const body = JSON.stringify(credits.body);
    assert.doesNotMatch(body, /sk-live-openrouter-secret/);
    assert.doesNotMatch(body, /sk-live-dedicated-openrouter-secret/);
    assert.doesNotMatch(body, /OPENROUTER_API_KEY/);
    assert.doesNotMatch(body, /ALLMODELAI_OPENROUTER_API_KEY/);
    delete process.env.ALLMODELAI_OPENROUTER_API_KEY;
});
