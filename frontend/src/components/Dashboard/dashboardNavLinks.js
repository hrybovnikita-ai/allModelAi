/** Full list (mobile menu). */
export const DASHBOARD_NAV_LINKS = [
  { to: '/chat', label: 'Chat' },
  { to: '/storage', label: 'Storage Hub' },
  { to: '/builder-25', label: 'Developer Toolkit' },
  { to: '/next-20', label: 'Workspace Tools' },
  { to: '/explore', label: 'Models' },
  { to: '/studio', label: 'Studio' },
  { to: '/next-25', label: 'AI Workflows' },
  { to: '/next-9', label: 'Research & Learning' },
  { to: '/next-10', label: 'Model Toolkit' },
  { to: '/ai-platform', label: 'AI Platform' },
  { to: '/website-builder', label: 'Website Builder' },
  { to: '/arena', label: 'Arena' },
  { to: '/ai-tools', label: 'Power Lab' },
  { to: '/creator-tools', label: 'Creator Lab' },
  { to: '/features', label: 'Features' },
  { to: '/control-center', label: 'Control' },
];

/** Desktop center nav — two rows max; secondary links in More. */
export const DASHBOARD_NAV_DESKTOP_MAIN = DASHBOARD_NAV_LINKS.slice(0, 10);

export const DASHBOARD_NAV_DESKTOP_MORE = DASHBOARD_NAV_LINKS.slice(10);
