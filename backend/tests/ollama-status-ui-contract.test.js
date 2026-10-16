'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

describe('Ollama status UI contracts', () => {
    test('frontend status helpers treat providers.ollama.configured as online', () => {
        const src = readFileSync(
            path.join(__dirname, '../../frontend/src/data/ollamaCloudVariants.js'),
            'utf8',
        );
        assert.match(src, /providers\?\.ollama\?\.configured/);
        assert.match(src, /markModelOnline/);
        assert.match(src, /never falls back to OpenRouter "others"/i);
    });

    test('historical provider error helper classifies Ollama config failures', () => {
        const src = readFileSync(
            path.join(__dirname, '../../frontend/src/lib/historicalProviderErrors.js'),
            'utf8',
        );
        assert.match(src, /OLLAMA_CLOUD_NOT_CONFIGURED/);
        assert.match(src, /Historical configuration error/);
        assert.doesNotMatch(src, /OLLAMA_API_KEY\s*=/);
    });

    test('status payload exposes boolean ollama for Ready vs API needed', () => {
        const { buildModelStatusPayload, resetModelStatusCacheForTests } = require('../src/services/modelStatusService');
        resetModelStatusCacheForTests();
        const body = buildModelStatusPayload();
        assert.equal(typeof body.models.ollama, 'boolean');
        assert.equal(typeof body.providers?.ollama?.configured, 'boolean');
    });
});
