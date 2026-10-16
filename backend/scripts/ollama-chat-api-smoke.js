'use strict';

/**
 * End-to-end smoke: register → POST /api/chat with Ollama Cloud.
 * Never prints the API key.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const {
    isOllamaCloudConfigured,
    DEFAULT_OLLAMA_CLOUD_MODEL,
} = require('../src/services/ollama/ollamaCloudConfig');

const BASE = process.env.OLLAMA_CHAT_SMOKE_BASE || 'http://127.0.0.1:5050';

async function main() {
    if (!isOllamaCloudConfigured()) {
        console.log(JSON.stringify({
            skipped: true,
            reason: 'OLLAMA_API_KEY not set in this process',
        }, null, 2));
        process.exitCode = 0;
        return;
    }

    const email = `ollama-api-smoke-${Date.now()}@example.com`;
    const password = 'TestPassword123!';
    const register = await fetch(`${BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Ollama API Smoke', email, password }),
    });
    const setCookie = register.headers.get('set-cookie') || '';
    const cookie = setCookie
        .split(/,(?=\s*[^;]+=)/)
        .map((part) => part.split(';')[0].trim())
        .filter(Boolean)
        .join('; ');

    if (!register.ok || !cookie) {
        const body = await register.json().catch(() => ({}));
        console.error(JSON.stringify({
            phase: 'register',
            status: register.status,
            message: body.message || 'register failed',
        }));
        process.exitCode = 1;
        return;
    }

    const statusRes = await fetch(`${BASE}/api/status/models`);
    const status = await statusRes.json();
    const chat = await fetch(`${BASE}/api/chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Cookie: cookie,
        },
        body: JSON.stringify({
            model: 'ollama',
            variant: 'gemma4-31b',
            temporary: true,
            messages: [{ role: 'user', text: 'Reply with exactly: OLLAMA_OK' }],
        }),
    });
    const text = await chat.text();
    let meta = null;
    let assistant = '';
    for (const line of text.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
            const event = JSON.parse(payload);
            if (event.actualModelId || event.routeDisplayName) meta = event;
            if (typeof event.text === 'string') assistant += event.text;
            if (typeof event.content === 'string' && !event.actualModelId) assistant += event.content;
            if (event.choices?.[0]?.delta?.content) assistant += event.choices[0].delta.content;
        } catch {
            // ignore malformed SSE chunks
        }
    }

    const report = {
        phase: 'chat',
        statusModelsOllama: Boolean(status.models?.ollama),
        chatStatus: chat.status,
        ok: chat.ok,
        modelRequested: DEFAULT_OLLAMA_CLOUD_MODEL,
        actualModelId: meta?.actualModelId || null,
        routeDisplayName: meta?.routeDisplayName || null,
        providerLabel: meta?.providerLabel || null,
        assistantPreview: assistant.slice(0, 160),
        hasKeyLeak: /OLLAMA_API_KEY|Bearer\s+\S+/i.test(text),
    };
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = chat.ok && report.actualModelId === 'gemma4:31b' && !report.hasKeyLeak ? 0 : 1;
}

main().catch((error) => {
    console.error(JSON.stringify({ phase: 'fatal', error: error.message || String(error) }));
    process.exitCode = 1;
});
