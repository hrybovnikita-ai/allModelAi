/** Real routes only — shown on dashboard quick-action grid */
export const DASHBOARD_QUICK_ACTIONS = [
  { to: '/chat', label: 'New Chat', iconKey: 'chat', description: 'Start a fresh conversation' },
  { to: '/chat?model=smart', label: 'Smart Router', iconKey: 'smart', description: 'Best model for your task' },
  { to: '/arena', label: 'AI Arena', iconKey: 'arena', description: 'Compare models side by side' },
  { to: '/studio', label: 'AI Studio', iconKey: 'studio', description: 'Creative & production tools' },
  { to: '/explore', label: 'Models', iconKey: 'models', description: 'Browse the model library' },
  { to: '/knowledge', label: 'Knowledge Base', iconKey: 'knowledge', description: 'Documents for grounded chat' },
  { to: '/settings', label: 'Settings', iconKey: 'settings', description: 'Account & security' },
];

export const DASHBOARD_MORE_TOOLS = [
  { to: '/website-builder', label: 'Website Builder', iconKey: 'studio', description: 'Generate and export sites' },
  { to: '/voice-studio', label: 'Voice Studio', iconKey: 'spark', description: 'Text to speech voices' },
  { to: '/credits', label: 'Credits', iconKey: 'spark', description: 'Balance and top-ups' },
  { to: '/usage-analytics', label: 'Usage analytics', iconKey: 'models', description: 'Deeper usage details' },
];
