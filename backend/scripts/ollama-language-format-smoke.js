'use strict';

/**
 * Live Ollama Cloud checks for language routing + code fence presence.
 * Never prints API keys.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const {
    isOllamaCloudConfigured,
    resolveOllamaCloudModel,
} = require('../src/services/ollama/ollamaCloudConfig');
const { resolveResponseLanguage } = require('../src/services/responseLanguage');
const {
    buildChatLanguageContext,
    buildProviderSystemPrompt,
} = require('../src/services/responseLanguagePolicy');

const BASE = process.env.OLLAMA_CHAT_SMOKE_BASE || 'http://127.0.0.1:5050';

const PROMPTS = [
    {
        id: 'en_fib',
        text: 'Write a Python function to calculate Fibonacci numbers.',
        expectLang: 'en',
        expectCode: true,
    },
    {
        id: 'ru_fib',
        text: 'Напиши функцию Python для вычисления чисел Фибоначчи.',
        expectLang: 'ru',
        expectCode: true,
    },
    {
        id: 'uk_fib',
        text: 'Напиши функцію Python для обчислення чисел Фібоначчі.',
        expectLang: 'uk',
        expectCode: true,
    },
    {
        id: 'pt_override',
        text: 'Answer in Portuguese: Explain what Python is.',
        expectLang: 'pt',
        expectCode: false,
    },
];

function heuristicLanguage(text) {
    const sample = String(text || '');
    if (/[іїєґ]/i.test(sample)) return 'uk';
    if (/[ыэъё]|функци|чисел|Фибоначчи/i.test(sample)) return 'ru';
    if (/\b(olá|você|função|números|é uma|linguagem)\b/i.test(sample)) return 'pt';
    if (/\b(the|function|return|python|here|below|following)\b/i.test(sample)) return 'en';
    return 'unknown';
}

function hasIndentedPython(text) {
    return /```(?:python)?[\s\S]*?\n[ \t]{2,}\S[\s\S]*?```/i.test(text)
        || /\ndef\s+\w+\([^)]*\):\n[ \t]{2,}\S/.test(text);
}

async function registerCookie() {
    const email = `ollama-lang-${Date.now()}@example.com`;
    const password = 'TestPassword123!';
    const register = await fetch(`${BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Lang Smoke', email, password }),
    });
    const setCookie = register.headers.get('set-cookie') || '';
    const cookie = setCookie
        .split(/,(?=\s*[^;]+=)/)
        .map((part) => part.split(';')[0].trim())
        .filter(Boolean)
        .join('; ');
    if (!register.ok || !cookie) {
        throw new Error(`register failed: ${register.status}`);
    }
    return cookie;
}

async function chatOnce(cookie, prompt) {
    const resolved = resolveResponseLanguage({ latestUserText: prompt.text, preference: 'auto' });
    const languageContext = buildChatLanguageContext({
        latestUserText: prompt.text,
        preference: 'auto',
    });
    const systemProbe = buildProviderSystemPrompt('You are helpful.', languageContext.policy);

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
            messages: [{ role: 'user', text: prompt.text }],
        }),
    });
    const raw = await chat.text();
    let meta = null;
    let assistant = '';
    for (const line of raw.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
            const event = JSON.parse(payload);
            if (event.actualModelId || event.responseLanguage) meta = { ...meta, ...event };
            if (typeof event.text === 'string') assistant += event.text;
        } catch {
            // ignore
        }
    }

    const observed = heuristicLanguage(assistant);
    return {
        id: prompt.id,
        httpStatus: chat.status,
        expectedLang: prompt.expectLang,
        routingResolved: resolved.code,
        metaLanguage: meta?.responseLanguage || null,
        actualModelId: meta?.actualModelId || null,
        providerLabel: meta?.providerLabel || null,
        systemHasMandatory: /MANDATORY RESPONSE LANGUAGE/.test(systemProbe),
        observedLangHeuristic: observed,
        languageMatch: observed === prompt.expectLang || (prompt.expectLang === 'en' && observed === 'en'),
        hasCodeFence: /```/.test(assistant),
        hasIndentedCode: hasIndentedPython(assistant),
        preview: assistant.slice(0, 180).replace(/\n/g, '\\n'),
        hasKeyLeak: /OLLAMA_API_KEY|Bearer\s+\S+/i.test(raw),
    };
}

async function main() {
    if (!isOllamaCloudConfigured()) {
        console.log(JSON.stringify({ skipped: true, reason: 'OLLAMA_API_KEY not set' }, null, 2));
        process.exitCode = 0;
        return;
    }

    console.log(JSON.stringify({
        phase: 'routing_unit',
        defaultModel: resolveOllamaCloudModel(null),
        detections: PROMPTS.map((prompt) => ({
            id: prompt.id,
            resolved: resolveResponseLanguage({ latestUserText: prompt.text }).code,
        })),
    }, null, 2));

    const cookie = await registerCookie();
    const results = [];
    for (const prompt of PROMPTS) {
        // Sequential to avoid rate limits.
        // eslint-disable-next-line no-await-in-loop
        results.push(await chatOnce(cookie, prompt));
    }

    const ok = results.every((row) => (
        row.httpStatus === 200
        && row.routingResolved === row.expectedLang
        && row.metaLanguage === row.expectedLang
        && row.languageMatch
        && !row.hasKeyLeak
        && (!row.id.includes('fib') || (row.hasCodeFence && row.hasIndentedCode))
    ));

    console.log(JSON.stringify({ phase: 'live', ok, results }, null, 2));
    process.exitCode = ok ? 0 : 1;
}

main().catch((error) => {
    console.error(JSON.stringify({ phase: 'fatal', error: error.message || String(error) }));
    process.exitCode = 1;
});
