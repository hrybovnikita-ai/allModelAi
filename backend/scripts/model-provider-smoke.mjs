/**
 * Real provider smoke tests (no secrets logged).
 * Usage: node scripts/model-provider-smoke.mjs [--slug gpt] [--variant mini]
 */
import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { getOpenRouterApiKey } = require('../src/openRouterConfig.js');
const {
  isBillingOrQuotaFailure,
  isTransientCapacityFailure,
} = require('../src/modelProviderEquivalence.js');

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(__dirname, '..');
dotenv.config({ path: join(backendRoot, '.env') });

const TEST_PROMPT = 'Reply with exactly: AllModelAI model test OK';
const modelVariants = JSON.parse(readFileSync(join(backendRoot, 'src/data/modelVariants.json'), 'utf8'));

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
  return { status, message: msg || `HTTP ${status}` };
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
      return { mode: 'blocked', reason: 'missing OPENAI or OpenRouter key' };
    case 'gemini':
      if (geminiKey()) return { mode: 'gemini', model: v.direct, providerModel: v.direct };
      if (gateway) return { mode: 'openrouter', model: v.gateway, providerModel: v.gateway };
      return { mode: 'blocked', reason: 'missing GEMINI or OpenRouter key' };
    case 'claude':
      if (gateway) return { mode: 'openrouter', model: v.gateway, providerModel: v.gateway };
      if (claudeKey()) return { mode: 'claude', model: v.direct, providerModel: v.direct };
      return { mode: 'blocked', reason: 'missing Claude or OpenRouter key' };
    case 'mistral':
      if (mistralKey()) return { mode: 'openai_compat', url: 'https://api.mistral.ai/v1/chat/completions', model: v.direct, providerModel: v.direct, key: mistralKey() };
      if (gateway) return { mode: 'openrouter', model: v.gateway, providerModel: v.gateway };
      return { mode: 'blocked', reason: 'missing MISTRAL or OpenRouter key' };
    case 'kimi':
      if (kimiKey()) {
        const base = (envTrim('KIMI_BASE_URL') || 'https://api.moonshot.cn/v1').replace(/\/+$/, '');
        return { mode: 'openai_compat', url: `${base}/chat/completions`, model: v.direct, providerModel: v.direct, key: kimiKey() };
      }
      if (gateway) return { mode: 'openrouter', model: v.gateway, providerModel: v.gateway };
      return { mode: 'blocked', reason: 'missing KIMI or OpenRouter key' };
    case 'cloudflare':
      if (cloudflareReady()) return { mode: 'cloudflare', model: v.direct, providerModel: v.direct };
      if (gateway) return { mode: 'openrouter', model: v.gateway, providerModel: v.gateway };
      return { mode: 'blocked', reason: 'missing CLOUDFLARE_ACCOUNT_ID or OpenRouter key' };
    default:
      if (gateway) return { mode: 'openrouter', model: v.gateway, providerModel: v.gateway };
      return { mode: 'blocked', reason: 'missing OpenRouter key' };
  }
}

async function invoke(route) {
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
        'X-Title': 'AllModelAI Smoke Test',
      },
      body: JSON.stringify({ model: route.model, stream: true, max_tokens: 64, messages }),
    });
    if (!res.ok) return { ok: false, ...sanitizeError(await res.json().catch(() => ({})), res.status) };
    const text = await readOpenAiStreamText(res);
    return { ok: text.length > 0, textPreview: text.slice(0, 120), status: 200 };
  }
  return { ok: false, message: 'unknown route mode' };
}

const args = process.argv.slice(2);
const slugFilter = args.includes('--slug') ? args[args.indexOf('--slug') + 1] : null;
const variantFilter = args.includes('--variant') ? args[args.indexOf('--variant') + 1] : null;

const rows = [];
for (const [slug, variants] of Object.entries(modelVariants)) {
  if (slugFilter && slug !== slugFilter) continue;
  for (const variant of variants) {
    if (variantFilter && variant.id !== variantFilter) continue;
    const route = pickRoute(slug, variant);
    const uiLabel = `${variant.name} (${variant.speed})`;
    process.stderr.write(`Testing ${slug}/${variant.id} via ${route.mode} ${route.providerModel || route.model || ''}…\n`);
    let result;
    let routeUsed = route.mode;
    try {
      result = await invoke(route);
      const orKey = openRouterKey();
      if (!result.ok && !result.blocked && orKey) {
        const billing = isBillingOrQuotaFailure(result.status, result.message);
        const capacity = isTransientCapacityFailure(result.status, result.message);
        if (billing || capacity) {
          if ((slug === 'gpt' || slug === 'copilot') && route.mode === 'openai') {
            const retry = await invoke({ mode: 'openrouter', model: variant.gateway, providerModel: variant.gateway });
            if (retry.ok) { result = retry; routeUsed = 'openrouter-equiv'; route.providerModel = variant.gateway; }
          } else if (slug === 'mistral' && route.mode === 'openai_compat') {
            const retry = await invoke({ mode: 'openrouter', model: variant.gateway, providerModel: variant.gateway });
            if (retry.ok) { result = retry; routeUsed = 'openrouter-equiv'; route.providerModel = variant.gateway; }
          } else if (slug === 'gemini' && route.mode === 'gemini') {
            const retry = await invoke({ mode: 'openrouter', model: variant.gateway, providerModel: variant.gateway });
            if (retry.ok) { result = retry; routeUsed = 'openrouter-equiv'; route.providerModel = variant.gateway; }
          } else if (slug === 'kimi' && route.mode === 'openai_compat') {
            const retry = await invoke({ mode: 'openrouter', model: variant.gateway, providerModel: variant.gateway });
            if (retry.ok) { result = retry; routeUsed = 'openrouter-equiv'; route.providerModel = variant.gateway; }
          } else if (slug === 'claude' && route.mode === 'openrouter' && claudeKey()) {
            const retry = await invoke({ mode: 'claude', model: variant.direct, providerModel: variant.direct });
            if (retry.ok) { result = retry; routeUsed = 'anthropic-equiv'; route.providerModel = variant.direct; }
          }
        }
      }
    } catch (error) {
      result = { ok: false, status: 0, message: error.message };
    }
    rows.push({
      slug,
      variantId: variant.id,
      ui: uiLabel,
      speed: variant.speed,
      route: routeUsed,
      providerModelId: route.providerModel || route.model || null,
      ok: result.ok,
      status: result.status,
      blocked: Boolean(result.blocked),
      message: result.message || '',
      preview: result.textPreview || '',
    });
  }
}

// OpenRouter generic regression
if (!slugFilter) {
  const or = openRouterKey();
  if (or) {
    process.stderr.write('Testing openrouter/auto regression…\n');
    try {
      const r = await invoke({ mode: 'openrouter', model: 'openrouter/auto', providerModel: 'openrouter/auto' });
      rows.push({
        slug: 'openrouter',
        variantId: 'auto',
        ui: 'OpenRouter Auto',
        speed: '-',
        route: 'openrouter',
        providerModelId: 'openrouter/auto',
        ok: r.ok,
        status: r.status,
        blocked: false,
        message: r.message || '',
        preview: r.textPreview || '',
      });
    } catch (error) {
      rows.push({
        slug: 'openrouter',
        variantId: 'auto',
        ui: 'OpenRouter Auto',
        speed: '-',
        route: 'openrouter',
        providerModelId: 'openrouter/auto',
        ok: false,
        status: 0,
        blocked: false,
        message: error.message,
        preview: '',
      });
    }
  }
}

console.log(JSON.stringify(rows, null, 2));
