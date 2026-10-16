'use strict';

const { test, describe, mock } = require('node:test');
const assert = require('node:assert/strict');

describe('Ollama Cloud config', () => {
    test('uses https://ollama.com/v1 by default and never invents localhost for cloud', () => {
        const prevBase = process.env.OLLAMA_BASE_URL;
        const prevKey = process.env.OLLAMA_API_KEY;
        delete process.env.OLLAMA_BASE_URL;
        process.env.OLLAMA_API_KEY = 'test-ollama-key-for-unit';
        delete require.cache[require.resolve('../src/services/ollama/ollamaCloudConfig')];
        const cfg = require('../src/services/ollama/ollamaCloudConfig');
        assert.equal(cfg.getOllamaCloudBaseUrl(), 'https://ollama.com/v1');
        assert.equal(cfg.ollamaCloudChatCompletionsUrl(), 'https://ollama.com/v1/chat/completions');
        assert.equal(cfg.isOllamaCloudConfigured(), true);
        assert.equal(cfg.isAllowedOllamaCloudModel('gemma4:31b'), true);
        assert.equal(cfg.isAllowedOllamaCloudModel('gpt-4.1-mini'), false);
        assert.equal(cfg.resolveOllamaCloudModel({ direct: 'gpt-oss:20b' }), 'gpt-oss:20b');
        if (prevBase === undefined) delete process.env.OLLAMA_BASE_URL;
        else process.env.OLLAMA_BASE_URL = prevBase;
        if (prevKey === undefined) delete process.env.OLLAMA_API_KEY;
        else process.env.OLLAMA_API_KEY = prevKey;
        delete require.cache[require.resolve('../src/services/ollama/ollamaCloudConfig')];
    });

    test('rejects localhost OLLAMA_BASE_URL override for cloud mode', () => {
        const prevBase = process.env.OLLAMA_BASE_URL;
        process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:11434/v1';
        delete require.cache[require.resolve('../src/services/ollama/ollamaCloudConfig')];
        const cfg = require('../src/services/ollama/ollamaCloudConfig');
        assert.equal(cfg.getOllamaCloudBaseUrl(), 'https://ollama.com/v1');
        if (prevBase === undefined) delete process.env.OLLAMA_BASE_URL;
        else process.env.OLLAMA_BASE_URL = prevBase;
        delete require.cache[require.resolve('../src/services/ollama/ollamaCloudConfig')];
    });

    test('maps auth and rate-limit errors without leaking secrets', () => {
        const cfg = require('../src/services/ollama/ollamaCloudConfig');
        const auth = cfg.mapOllamaCloudHttpError(401, 'Bearer sk-secret-should-not-leak');
        assert.equal(auth.code, 'OLLAMA_CLOUD_AUTH_FAILED');
        assert.doesNotMatch(auth.message, /sk-secret/);
        const limited = cfg.mapOllamaCloudHttpError(429, 'rate limit');
        assert.equal(limited.code, 'OLLAMA_CLOUD_RATE_LIMITED');
        assert.equal(limited.clientStatus, 429);
    });

    test('verified catalog matches live public /v1/models ids (sample)', async () => {
        const cfg = require('../src/services/ollama/ollamaCloudConfig');
        const response = await fetch('https://ollama.com/v1/models', {
            signal: AbortSignal.timeout(10000),
        });
        assert.equal(response.ok, true);
        const data = await response.json();
        const ids = new Set((data.data || []).map((row) => row.id));
        assert.ok(ids.has('gemma4:31b'));
        assert.ok(ids.has('gpt-oss:20b'));
        for (const id of ['gemma4:31b', 'gpt-oss:20b', 'deepseek-v4.1-flash']) {
            assert.ok(cfg.VERIFIED_OLLAMA_CLOUD_MODELS.includes(id));
            assert.ok(ids.has(id), `live catalog missing ${id}`);
        }
    });
});

describe('Ollama Cloud chat provider runtime', () => {
    test('routedModelHasApiKey recognizes ollama only with OLLAMA_API_KEY', () => {
        const prev = process.env.OLLAMA_API_KEY;
        delete process.env.OLLAMA_API_KEY;
        delete require.cache[require.resolve('../src/chatProviderRuntime')];
        let runtime = require('../src/chatProviderRuntime');
        assert.equal(runtime.routedModelHasApiKey('ollama'), false);
        process.env.OLLAMA_API_KEY = 'test-ollama-key-for-unit';
        delete require.cache[require.resolve('../src/chatProviderRuntime')];
        runtime = require('../src/chatProviderRuntime');
        assert.equal(runtime.routedModelHasApiKey('ollama'), true);
        assert.equal(runtime.isChatProviderConfigured('ollama'), true);
        if (prev === undefined) delete process.env.OLLAMA_API_KEY;
        else process.env.OLLAMA_API_KEY = prev;
        delete require.cache[require.resolve('../src/chatProviderRuntime')];
    });
});

describe('Ollama model variants', () => {
    test('ollama variants use verified direct ids and are not labeled as GPT-4.1 Mini', () => {
        const variants = require('../src/data/modelVariants.json');
        assert.ok(Array.isArray(variants.ollama));
        assert.ok(variants.ollama.length >= 3);
        for (const item of variants.ollama) {
            assert.ok(item.direct);
            assert.doesNotMatch(String(item.name), /GPT-4\.1 Mini/i);
            assert.doesNotMatch(String(item.direct), /^openai\//i);
        }
        assert.equal(variants.ollama[0].direct, 'gemma4:31b');
    });
});

describe('Ollama provider health mapping', () => {
    test('slugToProviderId maps ollama and ollama_cloud to ollama catalog id', () => {
        const { slugToProviderId } = require('../src/services/providerErrorClassification');
        assert.equal(slugToProviderId('ollama'), 'ollama');
        assert.equal(slugToProviderId('ollama_cloud'), 'ollama');
    });
});

describe('Ollama chat adapter routing', () => {
    test('createChat uses Ollama Cloud URL and verified model id for ollama slug', async () => {
        const prevKey = process.env.OLLAMA_API_KEY;
        const prevBase = process.env.OLLAMA_BASE_URL;
        process.env.OLLAMA_API_KEY = 'test-ollama-chat-adapter-key';
        process.env.OLLAMA_BASE_URL = 'https://ollama.com/v1';
        delete require.cache[require.resolve('../src/services/ollama/ollamaCloudConfig')];
        const cfg = require('../src/services/ollama/ollamaCloudConfig');
        assert.equal(cfg.isOllamaCloudConfigured(), true);
        assert.equal(cfg.ollamaCloudChatCompletionsUrl(), 'https://ollama.com/v1/chat/completions');
        assert.equal(cfg.resolveOllamaCloudModel({ id: 'gemma4-31b', direct: 'gemma4:31b' }), 'gemma4:31b');
        assert.equal(cfg.isAllowedOllamaCloudModel('gemma4:31b'), true);
        assert.equal(cfg.isAllowedOllamaCloudModel('openai/gpt-4.1-mini'), false);
        if (prevKey === undefined) delete process.env.OLLAMA_API_KEY;
        else process.env.OLLAMA_API_KEY = prevKey;
        if (prevBase === undefined) delete process.env.OLLAMA_BASE_URL;
        else process.env.OLLAMA_BASE_URL = prevBase;
        delete require.cache[require.resolve('../src/services/ollama/ollamaCloudConfig')];
    });
});

describe('Ollama model discovery for selector', () => {
    test('status payload always exposes ollama variants and boolean availability', () => {
        delete require.cache[require.resolve('../src/services/modelStatusService')];
        const {
            buildModelStatusPayload,
            ensureOllamaVariants,
            resetModelStatusCacheForTests,
        } = require('../src/services/modelStatusService');
        resetModelStatusCacheForTests();
        const body = buildModelStatusPayload();
        assert.equal(typeof body.models.ollama, 'boolean');
        assert.ok(Array.isArray(body.variants.ollama));
        assert.ok(body.variants.ollama.length >= 1);
        assert.equal(body.variants.ollama[0].direct, 'gemma4:31b');
        const repaired = ensureOllamaVariants({
            models: { others: true },
            variants: { gpt: [{ id: 'mini', name: 'Mini', direct: 'gpt-4o-mini' }] },
        });
        assert.equal(repaired.models.ollama, false);
        assert.ok(repaired.variants.ollama.length >= 1);
        assert.ok(repaired.variants.gpt.length >= 1);
    });

    test('OLLAMA_API_KEY is read by config without appearing in status payload', () => {
        const prev = process.env.OLLAMA_API_KEY;
        process.env.OLLAMA_API_KEY = 'test-ollama-selector-key';
        delete require.cache[require.resolve('../src/services/ollama/ollamaCloudConfig')];
        delete require.cache[require.resolve('../src/services/modelStatusService')];
        const { buildModelStatusPayload, resetModelStatusCacheForTests } = require('../src/services/modelStatusService');
        resetModelStatusCacheForTests();
        const body = buildModelStatusPayload();
        assert.equal(body.models.ollama, true);
        const serialized = JSON.stringify(body);
        assert.doesNotMatch(serialized, /test-ollama-selector-key/);
        assert.doesNotMatch(serialized, /OLLAMA_API_KEY/);
        if (prev === undefined) delete process.env.OLLAMA_API_KEY;
        else process.env.OLLAMA_API_KEY = prev;
        delete require.cache[require.resolve('../src/services/ollama/ollamaCloudConfig')];
        delete require.cache[require.resolve('../src/services/modelStatusService')];
    });
});
