const { test } = require('node:test');
const assert = require('node:assert/strict');
const { imageGenerationHealth } = require('../src/imageConfig');

const names = [
    'IMAGE_PROVIDER', 'IMAGE_GENERATION_PROVIDER', 'CLOUDFLARE_ACCOUNT_ID', 'CF_ACCOUNT_ID',
    'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_API_KEY', 'AllModelAi_API_KEY_IMAGE', 'POLLINATIONS_API_KEY',
    'COMFY_CLOUD_API_KEY', 'COMFYUI_API_KEY', 'IMAGE_ALLOW_FALLBACK',
];
const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));

function clearEnv() {
    names.forEach((name) => delete process.env[name]);
}

test('explicit cloudflare env without account id is not configured', () => {
    clearEnv();
    process.env.IMAGE_GENERATION_PROVIDER = 'cloudflare';
    process.env.CLOUDFLARE_API_KEY = 'cf-test-token';
    const { listConfiguredImageProviders } = require('../src/services/imageGenerationService');
    assert.deepEqual(listConfiguredImageProviders(), []);
    for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
});

test('imageGenerationHealth reports cloudflare blocked without account id', () => {
    clearEnv();
    process.env.IMAGE_GENERATION_PROVIDER = 'cloudflare';
    process.env.CLOUDFLARE_API_TOKEN = 'cf-test-token';
    const health = imageGenerationHealth();
    assert.equal(health.configured, false);
    assert.equal(health.cloudflare.tokenPresent, true);
    assert.equal(health.cloudflare.accountIdPresent, false);
    assert.equal(health.cloudflare.ready, false);
    assert.equal(health.code, 'IMAGE_NOT_CONFIGURED');
    for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
});
