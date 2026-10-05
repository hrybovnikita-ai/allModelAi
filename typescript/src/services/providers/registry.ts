import type { AIProviderDescriptor } from '../../types/domain';

/** Known provider metadata (ids align with backend chatProviderRuntime). */
export const AI_PROVIDER_CATALOG: readonly AIProviderDescriptor[] = [
  { id: 'openai', name: 'OpenAI', configKeyHints: ['OPENAI_API_KEY', 'OPEN_AI_API_KEY'] },
  { id: 'gemini', name: 'Google Gemini', configKeyHints: ['GEMINI_API_KEY'] },
  { id: 'claude', name: 'Anthropic Claude', configKeyHints: ['CLAUDE_API_KEY'] },
  { id: 'grok', name: 'xAI Grok', configKeyHints: ['XAI_API_KEY', 'GROK_API_KEY', 'GROK_PROVIDER'] },
  { id: 'deepseek', name: 'DeepSeek', configKeyHints: ['OPENROUTER_API_KEY', 'API_KEY'] },
  { id: 'llama', name: 'Meta Llama', configKeyHints: ['OPENROUTER_API_KEY', 'API_KEY'] },
  { id: 'mistral', name: 'Mistral', configKeyHints: ['MISTRAL_API_KEY', 'OPENROUTER_API_KEY'] },
  { id: 'kimi', name: 'Kimi / Moonshot', configKeyHints: ['KIMI_API_KEY', 'KIMI_BASE_URL', 'KIMI_PROVIDER'] },
  { id: 'cloudflare', name: 'Cloudflare Workers AI', configKeyHints: ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_KEY'] },
  { id: 'openrouter', name: 'OpenRouter Gateway', configKeyHints: ['OPENROUTER_API_KEY', 'API_KEY'] },
  { id: 'perplexity', name: 'Perplexity', configKeyHints: ['OPENROUTER_API_KEY'] },
  { id: 'copilot', name: 'Copilot', configKeyHints: ['OPENROUTER_API_KEY'] },
] as const;

export function getProviderDescriptor(id: string): AIProviderDescriptor | undefined {
  return AI_PROVIDER_CATALOG.find((p) => p.id === id);
}
