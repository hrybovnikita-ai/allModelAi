/**
 * Live provider smoke tests (no secrets logged).
 *
 * Plan only (no paid calls):
 *   node scripts/model-provider-smoke.mjs --plan --batch batch1
 *
 * Run after explicit approval:
 *   ALLMODELAI_LIVE_MODEL_PROBE=1 node scripts/model-provider-smoke.mjs --approve --batch batch1
 */
import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { getOpenRouterApiKey } = require('../src/openRouterConfig.js');
const { resolveDeepSeekApiModel } = require('../src/services/deepseekModelIds.js');
const {
  isBillingOrQuotaFailure,
  isTransientCapacityFailure,
} = require('../src/modelProviderEquivalence.js');

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(__dirname, '..');
dotenv.config({ path: join(backendRoot, '.env') });

const TEST_PROMPT = 'Say: OK';
const MAX_OUTPUT_TOKENS = 16;

const BATCH_PRESETS = {
  batch1: [
    { slug: 'claude', variant: 'sonnet' },
    { slug: 'gemini', variant: '3.6-flash' },
    { slug: 'deepseek', variant: 'flash' },
  ],
};

const modelVariants = JSON.parse(readFileSync(join(backendRoot, 'src/data/modelVariants.json'), 'utf8'));

const envTrim = (name) => String(process.env[name] || '').trim();
const openRouterKey = () => getOpenRouterApiKey();
const openAiKey = () => envTrim('OPENAI_API_KEY') || envTrim('OPEN_AI_API_KEY');
const geminiKey = () => envTrim('GEMINI_API_KEY');
const claudeKey = () => envTrim('CLAUDE_API_KEY');
const deepseekKey = () => envTrim('DEEPSEEK_API_KEY');
const mistralKey = () => envTrim('MISTRAL_API_KEY');
const kimiKey = () => (envTrim('KIMI_PROVIDER') === 'openrouter' ? '' : envTrim('KIMI_API_KEY'));
const cloudflareReady = () => Boolean(envTrim('CLOUDFLARE_ACCOUNT_ID') && (envTrim('CLOUDFLARE_API_KEY') || envTrim('CLAUDEFLARE_API_KEY')));

function parseCli(argv) {
  const opts = {
    slugs: [],
    variants: [],
    limit: Infinity,
    noFallback: true,
    noRetry: true,
    batch: null,
    plan: false,
    approve: false,
    listStage2: false,
    includeOpenRouterAuto: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--plan') opts.plan = true;
    else if (arg === '--approve') opts.approve = true;
    else if (arg === '--no-fallback') opts.noFallback = true;
    else if (arg === '--allow-fallback') opts.noFallback = false;
    else if (arg === '--no-retry') opts.noRetry = true;
    else if (arg === '--allow-retry') opts.noRetry = false;
    else if (arg === '--list-stage2') opts.listStage2 = true;
    else if (arg === '--include-openrouter-auto') opts.includeOpenRouterAuto = true;
    else if (arg === '--batch') opts.batch = argv[++i];
    else if (arg === '--slug') opts.slugs.push(...String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean));
    else if (arg === '--provider' || arg === '--providers') opts.slugs.push(...String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean));
    else if (arg === '--variant') opts.variants.push(...String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean));
    else if (arg === '--limit') opts.limit = Math.max(1, Number(argv[++i]) || 1);
  }
  return opts;
}

function sanitizeError(body, status) {
  const msg = String(body?.error?.message || body?.message || body?.errors?.[0]?.message || '').slice(0, 240);
  return { status, message: msg || `HTTP ${status}` };
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
      if (claudeKey()) return { mode: 'claude', model: v.direct, providerModel: v.direct };
      if (gateway) return { mode: 'openrouter', model: v.gateway, providerModel: v.gateway };
      return { mode: 'blocked', reason: 'missing Claude or OpenRouter key' };
    case 'deepseek':
      if (deepseekKey()) {
        const modelId = v.direct || resolveDeepSeekApiModel(v.id);
        return {
          mode: 'openai_compat',
          url: 'https://api.deepseek.com/chat/completions',
          model: modelId,
          providerModel: modelId,
          key: deepseekKey(),
        };
      }
      if (gateway) return { mode: 'openrouter', model: v.gateway, providerModel: v.gateway };
      return { mode: 'blocked', reason: 'missing DEEPSEEK or OpenRouter key' };
    case 'mistral':
      if (mistralKey()) {
        return { mode: 'openai_compat', url: 'https://api.mistral.ai/v1/chat/completions', model: v.direct, providerModel: v.direct, key: mistralKey() };
      }
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

/** Rough upper-bound USD per probe (short prompt, 16 output tokens). */
function estimateProbeCostUsd(slug, variant, route) {
  const inputTok = 12;
  const outTok = MAX_OUTPUT_TOKENS;
  if (route.mode === 'blocked') return 0;
  if (slug === 'claude' && variant.id === 'sonnet') return (inputTok * 3 + outTok * 15) / 1e6;
  if (slug === 'gemini') return (inputTok * 0.15 + outTok * 0.6) / 1e6;
  if (slug === 'deepseek' && variant.id === 'flash') return (inputTok * 0.3 + outTok * 1.2) / 1e6;
  return 0.002;
}

async function invoke(route) {
  const started = Date.now();
  const signal = AbortSignal.timeout(Number(process.env.AI_REQUEST_TIMEOUT_MS) || 45000);
  const messages = [{ role: 'user', content: TEST_PROMPT }];
  if (route.mode === 'blocked') {
    return { ok: false, blocked: true, latencyMs: Date.now() - started, ...sanitizeError({ message: route.reason }, 0) };
  }
  if (route.mode === 'openai' || route.mode === 'openai_compat') {
    const res = await fetch(route.mode === 'openai' ? 'https://api.openai.com/v1/chat/completions' : route.url, {
      method: 'POST',
      signal,
      headers: { Authorization: `Bearer ${route.mode === 'openai' ? openAiKey() : route.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: route.model, stream: false, max_tokens: MAX_OUTPUT_TOKENS, messages }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, latencyMs: Date.now() - started, responseModelId: body?.model || route.model, ...sanitizeError(body, res.status) };
    const text = String(body?.choices?.[0]?.message?.content || '').trim();
    return { ok: text.length > 0, latencyMs: Date.now() - started, status: res.status, responseModelId: body?.model || route.model, textPreview: text.slice(0, 120) };
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
        stream: false,
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [{ role: 'user', content: TEST_PROMPT }],
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, latencyMs: Date.now() - started, responseModelId: body?.model || route.model, ...sanitizeError(body, res.status) };
    const text = (body.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    return { ok: text.length > 0, latencyMs: Date.now() - started, status: res.status, responseModelId: body?.model || route.model, textPreview: text.slice(0, 120) };
  }
  if (route.mode === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(route.model)}:generateContent?key=${encodeURIComponent(geminiKey())}`;
    const res = await fetch(url, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: TEST_PROMPT }] }],
        generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, latencyMs: Date.now() - started, responseModelId: route.model, ...sanitizeError(body, res.status) };
    const parts = body?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts) ? parts.filter((p) => p?.text && !p.thought).map((p) => p.text).join('').trim() : '';
    const version = body?.modelVersion || route.model;
    return { ok: text.length > 0, latencyMs: Date.now() - started, status: res.status, responseModelId: version, textPreview: text.slice(0, 120) };
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
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, latencyMs: Date.now() - started, responseModelId: route.model, ...sanitizeError(body, res.status) };
    const text = String(body.result?.response || '').trim();
    return { ok: text.length > 0, latencyMs: Date.now() - started, status: res.status, responseModelId: route.model, textPreview: text.slice(0, 120) };
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
      body: JSON.stringify({ model: route.model, stream: false, max_tokens: MAX_OUTPUT_TOKENS, messages }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, latencyMs: Date.now() - started, responseModelId: body?.model || route.model, ...sanitizeError(body, res.status) };
    const text = String(body?.choices?.[0]?.message?.content || '').trim();
    return { ok: text.length > 0, latencyMs: Date.now() - started, status: res.status, responseModelId: body?.model || route.model, textPreview: text.slice(0, 120) };
  }
  return { ok: false, latencyMs: Date.now() - started, message: 'unknown route mode' };
}

function buildQueue(opts) {
  if (opts.batch) {
    const preset = BATCH_PRESETS[opts.batch];
    if (!preset) throw new Error(`Unknown batch "${opts.batch}". Available: ${Object.keys(BATCH_PRESETS).join(', ')}`);
    return preset.map(({ slug, variant }) => {
      const v = modelVariants[slug]?.find((item) => item.id === variant);
      if (!v) throw new Error(`Unknown ${slug}/${variant} in batch ${opts.batch}`);
      return { slug, variant: v };
    });
  }
  const queue = [];
  for (const [slug, variants] of Object.entries(modelVariants)) {
    if (opts.slugs.length && !opts.slugs.includes(slug)) continue;
    for (const variant of variants) {
      if (opts.variants.length && !opts.variants.includes(variant.id)) continue;
      queue.push({ slug, variant });
    }
  }
  return queue.slice(0, opts.limit === Infinity ? undefined : opts.limit);
}

function stage2Targets(exclude = BATCH_PRESETS.batch1) {
  const skip = new Set(exclude.map(({ slug, variant }) => `${slug}/${variant}`));
  const out = [];
  for (const [slug, variants] of Object.entries(modelVariants)) {
    for (const variant of variants) {
      const key = `${slug}/${variant.id}`;
      if (!skip.has(key)) out.push({ slug, variantId: variant.id, ui: variant.name || variant.id });
    }
  }
  return out;
}

const opts = parseCli(process.argv.slice(2));

if (opts.listStage2) {
  console.log(JSON.stringify({ stage2: stage2Targets(), count: stage2Targets().length }, null, 2));
  process.exit(0);
}

const queue = buildQueue(opts);

if (!opts.approve) {
  const plan = queue.map(({ slug, variant }) => {
    const route = pickRoute(slug, variant);
    return {
      slug,
      variantId: variant.id,
      ui: `${variant.name || slug} (${variant.speed})`,
      route: route.mode,
      providerModelId: route.providerModel || route.model || null,
      blocked: route.mode === 'blocked',
      blockedReason: route.reason || '',
      estCostUsd: Number(estimateProbeCostUsd(slug, variant, route).toFixed(5)),
    };
  });
  const total = plan.reduce((sum, row) => sum + row.estCostUsd, 0);
  console.log(JSON.stringify({
    mode: 'plan',
    prompt: TEST_PROMPT,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    noFallback: opts.noFallback,
    noRetry: opts.noRetry,
    requestCount: plan.length,
    estimatedTotalUsd: Number(total.toFixed(4)),
    estimatedNote: 'Upper-bound rough estimate; actual billing may be lower (cache/off-peak).',
    rows: plan,
    runAfterApproval: 'ALLMODELAI_LIVE_MODEL_PROBE=1 node scripts/model-provider-smoke.mjs --approve' + (opts.batch ? ` --batch ${opts.batch}` : opts.slugs.length ? ` --slug ${opts.slugs.join(',')}` : ''),
  }, null, 2));
  process.exit(0);
}

if (process.env.ALLMODELAI_LIVE_MODEL_PROBE !== '1') {
  console.error('Live model probes are disabled. Set ALLMODELAI_LIVE_MODEL_PROBE=1 together with --approve.');
  process.exit(2);
}

const rows = [];
for (const { slug, variant } of queue) {
  const route = pickRoute(slug, variant);
  const uiLabel = `${variant.name} (${variant.speed})`;
  process.stderr.write(`Testing ${slug}/${variant.id} via ${route.mode} ${route.providerModel || route.model || ''}…\n`);
  let result;
  let routeUsed = route.mode;
  try {
    result = await invoke(route);
    const orKey = openRouterKey();
    if (!opts.noRetry && !result.ok && !result.blocked && orKey) {
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
    result = { ok: false, status: 0, latencyMs: 0, message: error.message };
  }
  rows.push({
    slug,
    variantId: variant.id,
    ui: uiLabel,
    speed: variant.speed,
    route: routeUsed,
    providerModelId: route.providerModel || route.model || null,
    responseModelId: result.responseModelId || null,
    ok: result.ok,
    status: result.status,
    latencyMs: result.latencyMs,
    blocked: Boolean(result.blocked),
    message: result.message || '',
    preview: result.textPreview || '',
    textValid: Boolean(result.ok && /ok/i.test(result.textPreview || '')),
  });
}

if (opts.includeOpenRouterAuto && !opts.slugs.length && !opts.batch) {
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
        responseModelId: r.responseModelId,
        ok: r.ok,
        status: r.status,
        latencyMs: r.latencyMs,
        blocked: false,
        message: r.message || '',
        preview: r.textPreview || '',
        textValid: Boolean(r.ok && /ok/i.test(r.textPreview || '')),
      });
    } catch (error) {
      rows.push({
        slug: 'openrouter',
        variantId: 'auto',
        ui: 'OpenRouter Auto',
        speed: '-',
        route: 'openrouter',
        providerModelId: 'openrouter/auto',
        responseModelId: null,
        ok: false,
        status: 0,
        latencyMs: 0,
        blocked: false,
        message: error.message,
        preview: '',
        textValid: false,
      });
    }
  }
}

console.log(JSON.stringify(rows, null, 2));
