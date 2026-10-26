/** Real routes only — shown on dashboard quick-action grid */
export const DASHBOARD_QUICK_ACTIONS = [
  { to: '/chat', label: 'New Chat', icon: '💬', description: 'Start a fresh conversation' },
  { to: '/chat?model=smart', label: 'Smart Router', icon: '✦', description: 'Best model for your task' },
  { to: '/arena', label: 'AI Arena', icon: '⚔', description: 'Compare models side by side' },
  { to: '/studio', label: 'Studio', icon: '🖼', description: 'Creative & production tools' },
  { to: '/explore', label: 'Explore Models', icon: '◇', description: 'Browse the model library' },
  { to: '/knowledge', label: 'Knowledge Base', icon: '📚', description: 'Documents for grounded chat' },
  { to: '/settings', label: 'Settings', icon: '⚙', description: 'Account & security' },
];
