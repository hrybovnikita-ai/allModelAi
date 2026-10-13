/**
 * Mirrors backend smartRouter2/capabilities.js flags for UI only.
 * Keep in sync when routing capabilities change.
 */

export const MODEL_TECH_SPECS = {
  gpt: { modelId: 'gpt-4o-mini', contextWindow: '128K', toolUse: true },
  claude: { modelId: 'claude-haiku-4.5', contextWindow: '200K', toolUse: false },
  gemini: { modelId: 'gemini-2.5-flash', contextWindow: '1M', toolUse: false },
  perplexity: { modelId: 'sonar', contextWindow: null, toolUse: false },
  deepseek: { modelId: 'deepseek-flash', contextWindow: '1M', toolUse: false },
  llama: { modelId: 'llama-3.3-70b-instruct', contextWindow: '128K', toolUse: false },
  mistral: { modelId: 'mistral-small-latest', contextWindow: null, toolUse: false },
  kimi: { modelId: 'kimi-k2.5', contextWindow: '256K', toolUse: false },
  grok: { modelId: 'grok-latest', contextWindow: null, toolUse: false },
  cloudflare: { modelId: 'llama-3.3-70b-instruct-fp8-fast', contextWindow: null, toolUse: false },
  'gpt-oss': { modelId: '@cf/openai/gpt-oss-20b', contextWindow: null, toolUse: false },
  nemotron: { modelId: 'nvidia/nemotron-3-ultra-550b-a55b:free', contextWindow: null, toolUse: false },
  'deepseek-r1': { modelId: 'deepseek/deepseek-r1-0528:free', contextWindow: null, toolUse: false },
  qwen: { modelId: 'qwen-2.5-72b-instruct', contextWindow: '128K', toolUse: false },
  cohere: { modelId: 'command-a', contextWindow: '128K', toolUse: false },
  smart: { modelId: 'smart-router', contextWindow: null, toolUse: false },
  copilot: { modelId: null, contextWindow: null, toolUse: false },
  ai_python: { modelId: 'local-pytorch', contextWindow: null, toolUse: false },
};

export const MODEL_CAPABILITY_FLAGS = {
  gpt: {
    coding: true, reasoning: true, vision: true, longContext: true, fast: true,
    research: false, streaming: true, writing: true, summarization: true, translation: true,
  },
  claude: {
    coding: true, reasoning: true, vision: true, longContext: true, fast: false,
    research: false, streaming: true, writing: true, summarization: true, translation: true,
  },
  gemini: {
    coding: true, reasoning: true, vision: true, longContext: true, fast: true,
    research: false, streaming: true, writing: true, summarization: true, translation: true,
  },
  perplexity: {
    coding: false, reasoning: true, vision: false, longContext: false, fast: true,
    research: true, streaming: true, writing: true, summarization: true, translation: false,
  },
  deepseek: {
    coding: true, reasoning: true, vision: false, longContext: true, fast: true,
    research: false, streaming: true, writing: false, summarization: true, translation: false,
  },
  llama: {
    coding: true, reasoning: true, vision: false, longContext: true, fast: false,
    research: false, streaming: true, writing: true, summarization: true, translation: true,
  },
  mistral: {
    coding: true, reasoning: true, vision: false, longContext: false, fast: true,
    research: false, streaming: true, writing: true, summarization: true, translation: true,
  },
  kimi: {
    coding: true, reasoning: true, vision: false, longContext: true, fast: false,
    research: false, streaming: true, writing: true, summarization: true, translation: true,
  },
  grok: {
    coding: true, reasoning: true, vision: false, longContext: false, fast: true,
    research: false, streaming: true, writing: true, summarization: false, translation: false,
  },
  cloudflare: {
    coding: true, reasoning: false, vision: false, longContext: false, fast: true,
    research: false, streaming: true, writing: false, summarization: true, translation: false,
  },
  'gpt-oss': {
    coding: true, reasoning: true, vision: false, longContext: false, fast: true,
    research: false, streaming: true, writing: true, summarization: true, translation: true,
  },
  nemotron: {
    coding: true, reasoning: true, vision: false, longContext: true, fast: false,
    research: false, streaming: true, writing: true, summarization: true, translation: true,
  },
  'deepseek-r1': {
    coding: true, reasoning: true, vision: false, longContext: true, fast: false,
    research: false, streaming: true, writing: false, summarization: true, translation: true,
  },
  qwen: {
    coding: true, reasoning: true, vision: false, longContext: true, fast: false,
    research: false, streaming: true, writing: true, summarization: true, translation: true,
  },
  cohere: {
    coding: false, reasoning: true, vision: false, longContext: true, fast: false,
    research: false, streaming: true, writing: true, summarization: true, translation: true,
  },
};

/** UI capability cards — only shown when the model flag is true (or toolUse from specs). */
export const CAPABILITY_CARD_DEFS = [
  { id: 'programming', flag: 'coding', label: 'Programming', blurb: 'Code generation, debugging, and technical explanations.' },
  { id: 'reasoning', flag: 'reasoning', label: 'Reasoning', blurb: 'Multi-step analysis, planning, and structured thinking.' },
  { id: 'translation', flag: 'translation', label: 'Translation', blurb: 'Multilingual drafting and localized rewrites.' },
  { id: 'documents', flag: 'longContext', label: 'Document analysis', blurb: 'Long-context reading, synthesis, and comparison.' },
  { id: 'research', flag: 'research', label: 'Research', blurb: 'Evidence-oriented answers and source-aware synthesis.' },
  { id: 'vision', flag: 'vision', label: 'Image understanding', blurb: 'Screenshots, diagrams, and multimodal inputs.' },
  { id: 'writing', flag: 'writing', label: 'Writing', blurb: 'Drafts, rewriting, and audience-aware tone.' },
  { id: 'summaries', flag: 'summarization', label: 'Summarization', blurb: 'Concise briefs from long material.' },
  { id: 'streaming', flag: 'streaming', label: 'Streaming responses', blurb: 'Token streaming in AllModelAI chat.' },
];

export function capabilityCardsForSlug(slug) {
  const flags = MODEL_CAPABILITY_FLAGS[slug];
  const specs = MODEL_TECH_SPECS[slug];
  if (!flags) return [];
  const cards = CAPABILITY_CARD_DEFS.filter((def) => flags[def.flag]);
  if (specs?.toolUse) {
    cards.push({
      id: 'tools',
      flag: 'toolUse',
      label: 'Tool use',
      blurb: 'Structured outputs and tool-oriented workflows where supported.',
    });
  }
  return cards;
}

export function modalitiesForSlug(slug) {
  const flags = MODEL_CAPABILITY_FLAGS[slug];
  if (!flags) return ['Text'];
  const modes = ['Text'];
  if (flags.vision) modes.push('Images');
  return modes;
}

export function statusKeyForSlug(slug) {
  if (slug === 'smart') return null;
  if (['gpt', 'gemini', 'claude', 'kimi', 'cloudflare', 'gpt-oss', 'nemotron', 'deepseek-r1', 'grok', 'perplexity'].includes(slug)) return slug;
  return 'others';
}

export function subscriptionLabelForModel(model, creditStatus) {
  if (model.slug === 'smart') return 'Included with every account';
  if (model.tier === 'free') return 'Free tier access';
  const allowed = creditStatus?.models?.includes('all') || creditStatus?.models?.includes(model.slug);
  if (creditStatus?.isDeveloper) return 'Developer mode — all models';
  if (allowed) return 'Included in your subscription';
  return 'Subscription or developer access required';
}

export function isModelAccessible(slug, creditStatus) {
  if (slug === 'smart') return true;
  return Boolean(creditStatus?.models?.includes('all') || creditStatus?.models?.includes(slug));
}
