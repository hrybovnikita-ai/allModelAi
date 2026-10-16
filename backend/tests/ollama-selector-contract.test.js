'use strict';

/**
 * Contract tests mirroring frontend ollamaCloudVariants.js selection helpers.
 * Keeps backend modelVariants and selector fallback IDs aligned.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

describe('Ollama selector contract (frontend fallback ↔ backend registry)', () => {
    test('frontend fallback variants match backend modelVariants.ollama direct ids', () => {
        const backend = require('../src/data/modelVariants.json').ollama;
        const frontendSrc = readFileSync(
            path.join(__dirname, '../../frontend/src/data/ollamaCloudVariants.js'),
            'utf8',
        );
        assert.ok(backend.length >= 3);
        for (const item of backend) {
            assert.match(frontendSrc, new RegExp(`direct:\\s*'${item.direct.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
            assert.match(frontendSrc, new RegExp(`id:\\s*'${item.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
        }
    });

    test('status payload enables selection of gemma4:31b by variant id', () => {
        const { buildModelStatusPayload, resetModelStatusCacheForTests } = require('../src/services/modelStatusService');
        resetModelStatusCacheForTests();
        const body = buildModelStatusPayload();
        const gemma = body.variants.ollama.find((item) => item.id === 'gemma4-31b');
        assert.ok(gemma);
        assert.equal(gemma.direct, 'gemma4:31b');
        assert.equal(typeof body.models.ollama, 'boolean');
    });
});
