// Shared data used by Leaderboard, Model Comparison, Status and Stats blocks.

export const platformStats = [
  { value: 12400000, suffix: '+', label: 'Messages processed' },
  { value: 12, suffix: '', label: 'AI models connected' },
  { value: 99.9, suffix: '%', label: 'Uptime last 90 days', decimals: 1 },
  { value: 180, suffix: '+', label: 'Countries served' },
];

export const modelBenchmarks = {
  claude: { reasoning: 96, coding: 94, writing: 97, speed: 72, context: '200K' },
  gpt: { reasoning: 93, coding: 92, writing: 90, speed: 78, context: '128K' },
  gemini: { reasoning: 90, coding: 88, writing: 87, speed: 95, context: '1M' },
  llama: { reasoning: 84, coding: 82, writing: 80, speed: 88, context: '128K' },
  deepseek: { reasoning: 91, coding: 95, writing: 78, speed: 82, context: '64K' },
  grok: { reasoning: 86, coding: 80, writing: 84, speed: 90, context: '128K' },
  mistral: { reasoning: 82, coding: 84, writing: 79, speed: 93, context: '32K' },
  perplexity: { reasoning: 85, coding: 70, writing: 82, speed: 89, context: '128K' },
  kimi: { reasoning: 88, coding: 79, writing: 85, speed: 76, context: '2M' },
  qwen: { reasoning: 87, coding: 86, writing: 81, speed: 85, context: '128K' },
  copilot: { reasoning: 80, coding: 90, writing: 78, speed: 80, context: '32K' },
  cohere: { reasoning: 78, coding: 72, writing: 86, speed: 91, context: '128K' },
};

export const leaderboardCategories = ['overall', 'coding', 'writing', 'reasoning', 'speed'];

// Score = weighted blend, category re-weights to a single metric.
export function leaderboardFor(category = 'overall') {
  return Object.entries(modelBenchmarks)
    .map(([slug, scores]) => {
      const score =
        category === 'overall'
          ? Math.round((scores.reasoning * 0.3 + scores.coding * 0.3 + scores.writing * 0.2 + scores.speed * 0.2) * 10) / 10
          : scores[category];
      return { slug, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export const systemStatus = [
  { name: 'Chat API', uptime: '99.99%', state: 'operational' },
  { name: 'Smart Router', uptime: '99.98%', state: 'operational' },
  { name: 'Model Gateway', uptime: '99.97%', state: 'operational' },
  { name: 'Website Builder', uptime: '99.95%', state: 'operational' },
  { name: 'Billing', uptime: '100%', state: 'operational' },
  { name: 'Streaming (SSE)', uptime: '99.92%', state: 'degraded' },
];

export const changelogEntries = [
  {
    version: '2.4.0', date: 'Coming soon', tag: 'Planned',
    title: 'Teams & shared workspaces',
    items: ['Shared chat libraries', 'Per-member usage analytics', 'Role-based access control'],
  },
  {
    version: '2.3.0', date: 'Today', tag: 'New',
    title: 'Comparison, Leaderboard & API Playground',
    items: ['Side-by-side model comparison', 'Community leaderboard with category filters', 'Interactive API Playground'],
  },
  {
    version: '2.2.0', date: 'Last week', tag: 'Improved',
    title: 'Smart Router upgrades',
    items: ['Faster routing decisions', 'Better coding-task detection', 'Fallback to second-best model'],
  },
  {
    version: '2.1.0', date: '2 weeks ago', tag: 'New',
    title: 'Prompt Gallery & Website Builder',
    items: ['Curated prompt collections', 'AI website generation', 'One-click export to code'],
  },
];
