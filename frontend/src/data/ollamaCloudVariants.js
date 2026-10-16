/**
 * Verified Ollama Cloud model versions (ids from GET https://ollama.com/v1/models).
 * Used as a selector fallback when /api/status/models omits variants.ollama
 * (e.g. stale backend process). Must stay in sync with backend modelVariants.json.
 * Never includes API keys.
 */
export const OLLAMA_CLOUD_VARIANTS = [
  {
    id: 'gemma4-31b',
    name: 'Gemma 4 31B',
    speed: 'Medium',
    description: 'Ollama Cloud — verified id gemma4:31b',
    gateway: 'gemma4:31b',
    direct: 'gemma4:31b',
  },
  {
    id: 'gpt-oss-20b',
    name: 'GPT-OSS 20B (Ollama Cloud)',
    speed: 'Fast',
    description: 'Ollama Cloud open-weight model — not OpenAI GPT-4.1',
    gateway: 'gpt-oss:20b',
    direct: 'gpt-oss:20b',
  },
  {
    id: 'gpt-oss-120b',
    name: 'GPT-OSS 120B (Ollama Cloud)',
    speed: 'High',
    description: 'Ollama Cloud open-weight model — not OpenAI GPT-4.1',
    gateway: 'gpt-oss:120b',
    direct: 'gpt-oss:120b',
  },
  {
    id: 'deepseek-v4.1-flash',
    name: 'DeepSeek V4.1 Flash',
    speed: 'Fast',
    description: 'Ollama Cloud — verified id deepseek-v4.1-flash',
    gateway: 'deepseek-v4.1-flash',
    direct: 'deepseek-v4.1-flash',
  },
  {
    id: 'nemotron-3-nano-30b',
    name: 'Nemotron 3 Nano 30B',
    speed: 'Fast',
    description: 'Ollama Cloud — verified id nemotron-3-nano:30b',
    gateway: 'nemotron-3-nano:30b',
    direct: 'nemotron-3-nano:30b',
  },
  {
    id: 'glm-5.3-flash',
    name: 'GLM 5.3 Flash',
    speed: 'Fast',
    description: 'Ollama Cloud — verified id glm-5.3-flash',
    gateway: 'glm-5.3-flash',
    direct: 'glm-5.3-flash',
  },
  {
    id: 'mistral-large-4',
    name: 'Mistral Large 4',
    speed: 'High',
    description: 'Ollama Cloud — verified id mistral-large-4',
    gateway: 'mistral-large-4',
    direct: 'mistral-large-4',
  },
];

/**
 * Merge /api/status/models variants with known Ollama Cloud fallbacks.
 * Prefers a non-empty API list when present.
 */
export function mergeModelVariantCatalog(variants = {}) {
  const next = { ...(variants || {}) };
  if (!Array.isArray(next.ollama) || next.ollama.length === 0) {
    next.ollama = OLLAMA_CLOUD_VARIANTS;
  }
  return next;
}

/**
 * Normalize model availability so Ollama never inherits OpenRouter "others".
 * Prefers explicit models.ollama, then providers.ollama.configured from status payload.
 * Missing both → not configured (false), never falls back to OpenRouter "others".
 */
export function normalizeModelStatusMap(models = {}, providers = {}) {
  const next = { ...(models || {}) };
  const providerConfigured = providers?.ollama?.configured === true
    || providers?.ollama?.status === 'configured'
    || providers?.ollama?.status === 'operational';
  if (Object.prototype.hasOwnProperty.call(next, 'ollama')) {
    next.ollama = Boolean(next.ollama) || providerConfigured;
  } else if (providerConfigured) {
    next.ollama = true;
  } else {
    next.ollama = false;
  }
  return next;
}

/** Mark a slug online after a verified successful response (does not invent other providers). */
export function markModelOnline(modelStatus = {}, slug) {
  if (!slug) return modelStatus;
  return { ...modelStatus, [slug]: true };
}

export function resolveModelOnlineStatus(slug, modelStatus = {}) {
  if (!Object.keys(modelStatus).length || slug === 'smart' || slug === 'anonin') return true;
  if (Object.prototype.hasOwnProperty.call(modelStatus, slug)) {
    return modelStatus[slug] !== false;
  }
  const directKeys = [
    'gpt', 'gemini', 'claude', 'kimi', 'cloudflare', 'gpt-oss',
    'nemotron', 'deepseek-r1', 'grok', 'groq', 'perplexity', 'ollama',
  ];
  const statusKey = directKeys.includes(slug) ? slug : 'others';
  return modelStatus[statusKey] !== false;
}
