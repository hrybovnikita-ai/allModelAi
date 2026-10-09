const test = require('node:test');
const assert = require('node:assert/strict');
const { imageConfigurationReport } = require('../src/imageConfig');

const names = [
    'COMFY_CLOUD_API_KEY', 'POLLINATIONS_API_KEY', 'POLINATIONS_API_KEY', 'IMAGE_API_KEY', 'OPENAI_API_KEY',
    'OPEN_AI_API_KEY', 'API_IMAGE_KEY', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_KEY',
    'IMAGE_PROVIDER',
];
const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));

function clear() {
    names.forEach((name) => delete process.env[name]);
}

test('imageConfigurationReport lists missing env vars when no provider is ready', () => {
    clear();
    try {
        const report = imageConfigurationReport();
        assert.equal(report.ok, false);
        assert.equal(report.configured, false);
        assert.ok(report.missing.some((line) => /COMFY_CLOUD_API_KEY|POLLINATIONS_API_KEY/i.test(line)));
        assert.equal(report.code, 'IMAGE_NOT_CONFIGURED');
    } finally {
        clear();
        for (const [name, value] of Object.entries(saved)) {
            if (value !== undefined) process.env[name] = value;
        }
    }
});

test('imageConfigurationReport ok when Pollinations key is valid', () => {
    clear();
    process.env.POLLINATIONS_API_KEY = 'sk_test_pollinations';
    try {
        const report = imageConfigurationReport();
        assert.equal(report.ok, true);
        assert.deepEqual(report.providers, ['pollinations']);
    } finally {
        clear();
        for (const [name, value] of Object.entries(saved)) {
            if (value !== undefined) process.env[name] = value;
        }
    }
});
