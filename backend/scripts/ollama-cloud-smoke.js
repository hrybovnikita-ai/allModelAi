'use strict';

/**
 * Safe Ollama Cloud smoke test.
 * Uses OLLAMA_API_KEY from the environment / backend/.env only (never prints the key).
 * Skips chat when the key is missing; always verifies the public model catalog.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const {
    getOllamaApiKey,
    getOllamaCloudBaseUrl,
    ollamaCloudChatCompletionsUrl,
    DEFAULT_OLLAMA_CLOUD_MODEL,
    VERIFIED_OLLAMA_CLOUD_MODELS,
    isAllowedOllamaCloudModel,
} = require('../src/services/ollama/ollamaCloudConfig');

async function main() {
    const baseUrl = getOllamaCloudBaseUrl();
    const modelsUrl = `${baseUrl}/models`;
    const catalogResponse = await fetch(modelsUrl, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
    });
    const catalog = await catalogResponse.json().catch(() => ({}));
    const liveIds = (catalog.data || []).map((row) => row.id).filter(Boolean);
    console.log(JSON.stringify({
        phase: 'catalog',
        status: catalogResponse.status,
        baseUrl,
        liveCount: liveIds.length,
        defaultModelPresent: liveIds.includes(DEFAULT_OLLAMA_CLOUD_MODEL),
        verifiedSubsetOk: VERIFIED_OLLAMA_CLOUD_MODELS.every((id) => liveIds.includes(id) || isAllowedOllamaCloudModel(id, liveIds)),
    }, null, 2));

    const key = getOllamaApiKey();
    if (!key) {
        console.log(JSON.stringify({
            phase: 'chat',
            skipped: true,
            reason: 'OLLAMA_API_KEY is not set in this environment',
        }, null, 2));
        process.exitCode = 0;
        return;
    }

    const model = process.env.OLLAMA_CLOUD_MODEL?.trim() || DEFAULT_OLLAMA_CLOUD_MODEL;
    if (!liveIds.includes(model) && !isAllowedOllamaCloudModel(model)) {
        console.error(JSON.stringify({
            phase: 'chat',
            status: 'aborted',
            error: 'Selected model is not in the live Ollama Cloud catalog',
            model,
        }));
        process.exitCode = 1;
        return;
    }

    const chatResponse = await fetch(ollamaCloudChatCompletionsUrl(), {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(Number(process.env.OLLAMA_CHAT_TIMEOUT_MS || 120000)),
        body: JSON.stringify({
            model,
            stream: false,
            max_tokens: 64,
            messages: [
                { role: 'system', content: 'Reply in one short sentence. Identify yourself as an Ollama Cloud model, not OpenAI GPT-4.1 Mini.' },
                { role: 'user', content: 'Say hello in one short sentence.' },
            ],
        }),
    });
    const data = await chatResponse.json().catch(() => ({}));
    const text = data?.choices?.[0]?.message?.content || '';
    console.log(JSON.stringify({
        phase: 'chat',
        status: chatResponse.status,
        ok: chatResponse.ok,
        modelRequested: model,
        modelReturned: data?.model || null,
        provider: 'ollama_cloud',
        textPreview: String(text).slice(0, 160),
        error: chatResponse.ok ? null : (data?.error?.message || data?.message || `HTTP ${chatResponse.status}`),
    }, null, 2));
    process.exitCode = chatResponse.ok ? 0 : 1;
}

main().catch((error) => {
    console.error(JSON.stringify({ phase: 'fatal', error: error.message || String(error) }));
    process.exitCode = 1;
});
