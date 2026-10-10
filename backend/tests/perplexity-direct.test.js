const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../app');
const { providerAvailabilityForRouter } = require('../src/providerHealth');
const { routedModelHasApiKey } = require('../src/chatProviderRuntime');
const { resolvePerplexityDirectModel } = require('../src/services/perplexityChat');

const savedKey = process.env.PERPLEXITY_API_KEY;
const savedOpenRouter = process.env.ALLMODELAI_OPENROUTER_API_KEY;

test.afterEach(() => {
    if (savedKey === undefined) delete process.env.PERPLEXITY_API_KEY;
    else process.env.PERPLEXITY_API_KEY = savedKey;
    if (savedOpenRouter === undefined) delete process.env.ALLMODELAI_OPENROUTER_API_KEY;
    else process.env.ALLMODELAI_OPENROUTER_API_KEY = savedOpenRouter;
});

test('resolvePerplexityDirectModel maps gateway ids to Sonar model names', () => {
    assert.equal(resolvePerplexityDirectModel({ gateway: 'perplexity/sonar-pro' }), 'sonar-pro');
    assert.equal(resolvePerplexityDirectModel({ direct: 'sonar-reasoning-pro' }), 'sonar-reasoning-pro');
});

test('Perplexity availability uses direct API key without OpenRouter', () => {
    delete process.env.ALLMODELAI_OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    process.env.PERPLEXITY_API_KEY = 'pplx-test-key';
    const availability = providerAvailabilityForRouter();
    assert.equal(availability.perplexity, true);
    assert.equal(routedModelHasApiKey('perplexity'), true);
});

test('GET /api/status/models exposes perplexity when key is configured', async () => {
    process.env.PERPLEXITY_API_KEY = 'pplx-test-key';
    const response = await request(app).get('/api/status/models');
    assert.equal(response.status, 200);
    assert.equal(response.body.models.perplexity, true);
    assert.equal(response.body.providers.perplexity.configured, true);
});
