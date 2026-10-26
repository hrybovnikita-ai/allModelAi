/** Real routes only — shown on dashboard quick-action grid */
export const DASHBOARD_QUICK_ACTIONS = [
  { to: '/chat', label: 'New Chat', iconKey: 'chat', description: 'Start a fresh conversation' },
  { to: '/chat?model=smart', label: 'Smart Router', iconKey: 'smart', description: 'Best model for your task' },
  { to: '/arena', label: 'AI Arena', iconKey: 'arena', description: 'Compare models side by side' },
  { to: '/studio', label: 'Studio', iconKey: 'studio', description: 'Creative & production tools' },
  { to: '/explore', label: 'Models', iconKey: 'models', description: 'Browse the model library' },
  { to: '/knowledge', label: 'Knowledge Base', iconKey: 'knowledge', description: 'Documents for grounded chat' },
  { to: '/settings', label: 'Settings', iconKey: 'settings', description: 'Account & security' },
];
