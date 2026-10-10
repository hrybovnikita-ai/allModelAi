const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { getOpenRouterApiKey } = require('../openRouterConfig');
const { MODEL_CAPABILITIES } = require('./smartRouter2/capabilities');
const {
    isBillingOrQuotaFailure,
    isTransientCapacityFailure,
} = require('../modelProviderEquivalence');

const TEST_PROMPT = 'Reply with exactly: AllModelAI model test OK';
const modelVariants = JSON.parse(
    readFileSync(join(__dirname, '../data/modelVariants.json'), 'utf8'),
);

const PROVIDER_LABELS = {
    gpt: 'OpenAI',
    copilot: 'Microsoft Copilot (OpenAI)',
    claude: 'Anthropic',
    gemini: 'Google Gemini',
    grok: 'xAI Grok',
    deepseek: 'DeepSeek',
    kimi: 'Moonshot Kimi',
    mistral: 'Mistral',
    qwen: 'Qwen',
    perplexity: 'Perplexity',
    cloudflare: 'Cloudflare AI',
    llama: 'Meta Llama (OpenRouter)',
    cohere: 'Cohere',
};

const lastResults = new Map();
const lastRunByUser = new Map();
const MIN_TEST_INTERVAL_MS = 3000;

const envTrim = (name) => String(process.env[name] || '').trim();
const openRouterKey = () => getOpenRouterApiKey();
const openAiKey = () => envTrim('OPENAI_API_KEY') || envTrim('OPEN_AI_API_KEY');
const geminiKey = () => envTrim('GEMINI_API_KEY');
const claudeKey = () => envTrim('CLAUDE_API_KEY');
const mistralKey = () => envTrim('MISTRAL_API_KEY');
const kimiKey = () => (envTrim('KIMI_PROVIDER') === 'openrouter' ? '' : envTrim('KIMI_API_KEY'));
const cloudflareReady = () => Boolean(envTrim('CLOUDFLARE_ACCOUNT_ID') && (envTrim('CLOUDFLARE_API_KEY') || envTrim('CLAUDEFLARE_API_KEY')));

function sanitizeError(body, status) {
    const msg = String(body?.error?.message || body?.message || body?.errors?.[0]?.message || '').slice(0, 240);
    return { status, message: msg || (status ? `HTTP ${status}` : 'Request failed') };
}

async function readOpenAiStreamText(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const events = buffer.replaceAll('\r\n', '\n').split('\n\n');
        buffer = events.pop() || '';
        for (const event of events) {
            const line = event.split('\n').find((l) => l.startsWith('data: '));
            if (!line) continue;
            const payload = line.slice(6).trim();
            if (!payload || payload === '[DONE]') continue;
            try {
                const chunk = JSON.parse(payload);
                const delta = chunk?.choices?.[0]?.delta?.content || chunk?.choices?.[0]?.delta?.text || '';
                text += delta;
            } catch {
                /* ignore */
            }
        }
        if (done) break;
    }
    return text.trim();
}

async function readClaudeStreamText(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const events = buffer.replaceAll('\r\n', '\n').split('\n\n');
        buffer = events.pop() || '';
        for (const event of events) {
            const line = event.split('\n').find((l) => l.startsWith('data: '));
            if (!line) continue;
            const payload = line.slice(6).trim();
            if (!payload || payload === '[DONE]') continue;
            try {
                const chunk = JSON.parse(payload);
                if (chunk.type === 'content_block_delta') text += chunk.delta?.text || '';
            } catch {
                /* ignore */
            }
        }
        if (done) break;
    }
    return text.trim();
}

async function readGeminiStreamText(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6).trim();
            if (!payload) continue;
            try {
                const chunk = JSON.parse(payload);
                const parts = chunk?.candidates?.[0]?.content?.parts;
                if (Array.isArray(parts)) {
                    text += parts.filter((p) => p?.text && !p.thought).map((p) => p.text).join('');
                }
            } catch {
                /* ignore */
            }
        }
        if (done) break;
    }
    return text.trim();
}

function pickRoute(slug, variant) {
    const gateway = openRouterKey();
    const v = variant;
    switch (slug) {
        case 'gpt':
        case 'copilot':
            if (openAiKey()) return { mode: 'openai', model: v.direct, providerModel: v.direct };
            if (gateway) return { mode: 'openrouter', model: v.gateway, providerModel: v.gateway };
            return { mode: 'blocked', reason: 'Missing OpenAI or OpenRouter API configuration' };
        case 'gemini':
            if (geminiKey()) return { mode: 'gemini', model: v.direct, providerModel: v.direct };
            if (gateway) return { mode: 'openrouter', model: v.gateway, providerModel: v.gateway };
            return { mode: 'blocked', reason: 'Missing Gemini or OpenRouter API configuration' };
        case 'claude':
            if (gateway) return { mode: 'openrouter', model: v.gateway, providerModel: v.gateway };
            if (claudeKey()) return { mode: 'claude', model: v.direct, providerModel: v.direct };
            return { mode: 'blocked', reason: 'Missing Claude or OpenRouter API configuration' };
        case 'mistral':
            if (mistralKey()) {
                return {
                    mode: 'openai_compat',
                    url: 'https://api.mistral.ai/v1/chat/completions',
                    model: v.direct,
                    providerModel: v.direct,
                    key: mistralKey(),
                };
            }
            if (gateway) return { mode: 'openrouter', model: v.gateway, providerModel: v.gateway };
            return { mode: 'blocked', reason: 'Missing Mistral or OpenRouter API configuration' };
        case 'kimi':
            if (kimiKey()) {
                const base = (envTrim('KIMI_BASE_URL') || 'https://api.moonshot.cn/v1').replace(/\/+$/, '');
                return {
                    mode: 'openai_compat',
                    url: `${base}/chat/completions`,
                    model: v.direct,
                    providerModel: v.direct,
                    key: kimiKey(),
                };
            }
            if (gateway) return { mode: 'openrouter', model: v.gateway, providerModel: v.gateway };
            return { mode: 'blocked', reason: 'Missing Kimi or OpenRouter API configuration' };
        case 'cloudflare':
            if (cloudflareReady()) return { mode: 'cloudflare', model: v.direct, providerModel: v.direct };
            if (gateway) return { mode: 'openrouter', model: v.gateway, providerModel: v.gateway };
            return { mode: 'blocked', reason: 'Missing Cloudflare or OpenRouter API configuration' };
        default:
            if (gateway) return { mode: 'openrouter', model: v.gateway, providerModel: v.gateway };
            return { mode: 'blocked', reason: 'Missing OpenRouter API configuration' };
    }
}

async function invokeProvider(route) {
    const signal = AbortSignal.timeout(Number(process.env.AI_REQUEST_TIMEOUT_MS) || 45000);
    const messages = [{ role: 'user', content: TEST_PROMPT }];
    if (route.mode === 'blocked') {
        return { ok: false, blocked: true, ...sanitizeError({ message: route.reason }, 0) };
    }
    if (route.mode === 'openai') {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            signal,
            headers: { Authorization: `Bearer ${openAiKey()}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: route.model, stream: true, max_tokens: 64, messages }),
        });
        if (!res.ok) return { ok: false, ...sanitizeError(await res.json().catch(() => ({})), res.status) };
        const text = await readOpenAiStreamText(res);
        return { ok: text.length > 0, textPreview: text.slice(0, 120), status: 200 };
    }
    if (route.mode === 'openai_compat') {
        const res = await fetch(route.url, {
            method: 'POST',
            signal,
            headers: { Authorization: `Bearer ${route.key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: route.model, stream: true, max_tokens: 64, messages }),
        });
        if (!res.ok) return { ok: false, ...sanitizeError(await res.json().catch(() => ({})), res.status) };
        const text = await readOpenAiStreamText(res);
        return { ok: text.length > 0, textPreview: text.slice(0, 120), status: 200 };
    }
    if (route.mode === 'claude') {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            signal,
            headers: {
                'x-api-key': claudeKey(),
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: route.model,
                stream: true,
                max_tokens: 64,
                messages: [{ role: 'user', content: TEST_PROMPT }],
            }),
        });
        if (!res.ok) return { ok: false, ...sanitizeError(await res.json().catch(() => ({})), res.status) };
        const text = await readClaudeStreamText(res);
        return { ok: text.length > 0, textPreview: text.slice(0, 120), status: 200 };
    }
    if (route.mode === 'gemini') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(route.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(geminiKey())}`;
        const res = await fetch(url, {
            method: 'POST',
            signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: TEST_PROMPT }] }],
                generationConfig: { maxOutputTokens: 64 },
            }),
        });
        if (!res.ok) return { ok: false, ...sanitizeError(await res.json().catch(() => ({})), res.status) };
        const text = await readGeminiStreamText(res);
        return { ok: text.length > 0, textPreview: text.slice(0, 120), status: 200 };
    }
    if (route.mode === 'cloudflare') {
        const account = envTrim('CLOUDFLARE_ACCOUNT_ID');
        const key = envTrim('CLOUDFLARE_API_KEY') || envTrim('CLAUDEFLARE_API_KEY');
        const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/run/${route.model}`;
        const res = await fetch(url, {
            method: 'POST',
            signal,
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: [{ role: 'user', content: TEST_PROMPT }] }),
        });
        if (!res.ok) return { ok: false, ...sanitizeError(await res.json().catch(() => ({})), res.status) };
        const data = await res.json();
        const text = String(data.result?.response || '').trim();
        return { ok: text.length > 0, textPreview: text.slice(0, 120), status: 200 };
    }
    if (route.mode === 'openrouter') {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            signal,
            headers: {
                Authorization: `Bearer ${openRouterKey()}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://all-model-ai.com',
                'X-Title': 'AllModelAI Diagnostics',
            },
            body: JSON.stringify({ model: route.model, stream: true, max_tokens: 64, messages }),
        });
        if (!res.ok) return { ok: false, ...sanitizeError(await res.json().catch(() => ({})), res.status) };
        const text = await readOpenAiStreamText(res);
        return { ok: text.length > 0, textPreview: text.slice(0, 120), status: 200 };
    }
    return { ok: false, message: 'Unknown route mode' };
}

function resultKey(email, slug, variantId) {
    return `${String(email).toLowerCase()}:${slug}:${variantId}`;
}

function capabilitiesForSlug(slug) {
    const caps = MODEL_CAPABILITIES[slug] || {};
    return {
        vision: Boolean(caps.vision),
        text: caps.streaming !== false,
    };
}

function buildCatalogRow(slug, variant, email) {
    const route = pickRoute(slug, variant);
    const caps = capabilitiesForSlug(slug);
    const cacheKey = resultKey(email, slug, variant.id);
    const last = lastResults.get(cacheKey);
    let availabilityStatus = 'not_tested';
    if (route.mode === 'blocked') availabilityStatus = 'blocked';
    else if (last?.ok) availabilityStatus = 'ok';
    else if (last && !last.ok) availabilityStatus = 'error';

    return {
        slug,
        variantId: variant.id,
        displayName: variant.name,
        provider: PROVIDER_LABELS[slug] || slug,
        modelIdentifier: route.providerModel || route.model || variant.gateway || variant.direct || slug,
        routeMode: route.mode,
        visionSupport: caps.vision,
        textGenerationSupport: caps.text,
        availabilityStatus,
        lastTest: last || null,
    };
}

function buildModelDiagnosticsCatalog(email) {
    const rows = [];
    for (const [slug, variants] of Object.entries(modelVariants)) {
        for (const variant of variants) {
            rows.push(buildCatalogRow(slug, variant, email));
        }
    }
    return { models: rows, generatedAt: new Date().toISOString() };
}

async function runModelDiagnosticTest({ email, slug, variantId, confirmBillable }) {
    if (!confirmBillable) {
        return {
            ok: false,
            status: 400,
            code: 'CONFIRMATION_REQUIRED',
            message: 'Confirm that this test may use billable provider quota before running.',
        };
    }
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const now = Date.now();
    const lastUserRun = lastRunByUser.get(normalizedEmail) || 0;
    if (now - lastUserRun < MIN_TEST_INTERVAL_MS) {
        return {
            ok: false,
            status: 429,
            code: 'RATE_LIMITED',
            message: 'Wait a few seconds between model tests.',
        };
    }
    lastRunByUser.set(normalizedEmail, now);

    const variants = modelVariants[slug];
    if (!variants?.length) {
        return { ok: false, status: 404, message: 'Unknown model slug.' };
    }
    const variant = variants.find((v) => v.id === variantId) || variants[0];
    const route = pickRoute(slug, variant);
    const started = Date.now();
    let result;
    let routeUsed = route.mode;
    try {
        result = await invokeProvider(route);
        const orKey = openRouterKey();
        if (!result.ok && !result.blocked && orKey) {
            const billing = isBillingOrQuotaFailure(result.status, result.message);
            const capacity = isTransientCapacityFailure(result.status, result.message);
            if (billing || capacity) {
                if ((slug === 'gpt' || slug === 'copilot') && route.mode === 'openai') {
                    const retry = await invokeProvider({ mode: 'openrouter', model: variant.gateway, providerModel: variant.gateway });
                    if (retry.ok) {
                        result = retry;
                        routeUsed = 'openrouter';
                    }
                } else if (slug === 'gemini' && route.mode === 'gemini') {
                    const retry = await invokeProvider({ mode: 'openrouter', model: variant.gateway, providerModel: variant.gateway });
                    if (retry.ok) {
                        result = retry;
                        routeUsed = 'openrouter';
                    }
                }
            }
        }
    } catch (error) {
        result = { ok: false, status: 0, message: error.message };
    }
    const responseTimeMs = Date.now() - started;
    const lastTest = {
        ok: Boolean(result.ok),
        testedAt: new Date().toISOString(),
        responseTimeMs,
        httpStatus: result.status || (result.ok ? 200 : 0),
        errorDescription: result.ok ? '' : (result.message || 'Test failed'),
        routeMode: routeUsed,
        preview: result.textPreview || '',
    };
    lastResults.set(resultKey(normalizedEmail, slug, variant.id), lastTest);
    return {
        ok: result.ok,
        status: result.ok ? 200 : (result.status || 502),
        slug,
        variantId: variant.id,
        lastTest,
        model: buildCatalogRow(slug, variant, normalizedEmail),
    };
}

module.exports = {
    buildModelDiagnosticsCatalog,
    runModelDiagnosticTest,
};
