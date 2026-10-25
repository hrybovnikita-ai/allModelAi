'use strict';

/**
 * Backend smoke: Groq GPT-OSS 120B direct API + optional HTTP chat via running server.
 * Never prints API keys.
 */

require('../scripts/load-backend-env').loadBackendEnv();

const {
    isGroqConfigured,
    probeGptOssGroqAvailability,
    GPT_OSS_GROQ_MODEL_ID,
    GROQ_CHAT_COMPLETIONS_URL,
} = require('../src/services/groqChat');

const BASE = process.env.GPT_OSS_GROQ_SMOKE_BASE || 'http://127.0.0.1:5050';

async function smokeDirectGroq() {
    if (!isGroqConfigured()) {
        return {
            phase: 'direct',
            skipped: true,
            reason: 'GROQ_API_KEY not set in backend environment',
            requiredEnv: ['GROQ_API_KEY'],
            endpoint: GROQ_CHAT_COMPLETIONS_URL,
            modelId: GPT_OSS_GROQ_MODEL_ID,
        };
    }
    const probe = await probeGptOssGroqAvailability();
    return {
        phase: 'direct',
        endpoint: GROQ_CHAT_COMPLETIONS_URL,
        modelId: GPT_OSS_GROQ_MODEL_ID,
        ok: probe.ok === true,
        probeStatus: probe.status,
        httpStatus: probe.httpStatus ?? null,
    };
}

async function smokeHttpChat() {
    if (!isGroqConfigured()) {
        return { phase: 'http_chat', skipped: true };
    }
    const email = `gpt-oss-groq-smoke-${Date.now()}@example.com`;
    const password = 'TestPassword123!';
    const register = await fetch(`${BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'GPT-OSS Groq Smoke', email, password }),
    });
    const setCookie = register.headers.get('set-cookie') || '';
    const cookie = setCookie
        .split(/,(?=\s*[^;]+=)/)
        .map((part) => part.split(';')[0].trim())
        .filter(Boolean)
        .join('; ');
    if (!register.ok || !cookie) {
        const body = await register.json().catch(() => ({}));
        return { phase: 'http_chat', ok: false, registerStatus: register.status, message: body.message || 'register failed' };
    }

    const statusRes = await fetch(`${BASE}/api/status/models`);
    const status = await statusRes.json().catch(() => ({}));
    const chat = await fetch(`${BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
            model: 'gpt-oss-groq',
            temporary: true,
            fallbackEnabled: false,
            messages: [{ role: 'user', text: 'Reply with exactly: GROQ_OSS_OK' }],
        }),
    });
    const text = await chat.text();
    return {
        phase: 'http_chat',
        ok: chat.ok && /GROQ_OSS_OK|gpt-oss|GPT-OSS/i.test(text),
        chatStatus: chat.status,
        modelsStatus: status?.models?.['gpt-oss-groq'],
        modelHealth: status?.modelHealth?.['gpt-oss-groq']?.status ?? null,
        snippet: text.slice(0, 280),
    };
}

async function main() {
    const direct = await smokeDirectGroq();
    let http = { phase: 'http_chat', skipped: true };
    if (process.env.GPT_OSS_GROQ_SMOKE_HTTP === '1') {
        http = await smokeHttpChat();
    }
    const report = { direct, http };
    console.log(JSON.stringify(report, null, 2));
    if (direct.skipped) {
        process.exitCode = 0;
    } else if (!direct.ok) {
        process.exitCode = 1;
    } else if (http.skipped === true) {
        process.exitCode = 0;
    } else {
        process.exitCode = http.ok ? 0 : 1;
    }
}

main().catch((error) => {
    console.error(JSON.stringify({ error: error.message }));
    process.exitCode = 1;
});
