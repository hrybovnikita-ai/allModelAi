import { dashboardModels } from '../../data/dashboardModels';
import gptLogo from '../../assets/gpt.png';

const bySlug = (slug) => dashboardModels.find((model) => model.slug === slug);

/** Decorative orbit badges — navigation uses real chat slugs where available. */
export const HERO_ORBIT_PROVIDERS = [
  { slug: 'gpt', label: 'ChatGPT', ring: 'inner' },
  { slug: 'gemini', label: 'Gemini', ring: 'inner' },
  { slug: 'claude', label: 'Claude', ring: 'inner' },
  { slug: 'copilot', label: 'Copilot', ring: 'inner' },
  { slug: 'grok', label: 'Grok', ring: 'inner' },
  { slug: 'perplexity', label: 'Perplexity', ring: 'inner' },
  { slug: 'deepseek', label: 'DeepSeek', ring: 'outer' },
  { slug: 'mistral', label: 'Mistral', ring: 'outer' },
  { slug: 'llama', label: 'Llama', ring: 'outer' },
  { slug: 'kimi', label: 'Kimi', ring: 'outer' },
  { slug: 'qwen', label: 'Qwen', ring: 'outer' },
  { slug: 'cloudflare', label: 'Cloudflare AI', ring: 'outer' },
  {
    slug: 'smart',
    label: 'OpenRouter',
    ring: 'outer',
    image: gptLogo,
    href: '/explore',
    decorativeOnly: true,
  },
].map((entry) => {
  const model = bySlug(entry.slug);
  return {
    ...entry,
    image: entry.image || model?.image || gptLogo,
    href: entry.href || (model ? `/chat?model=${model.slug}` : null),
    name: entry.label || model?.name || entry.slug,
  };
});
