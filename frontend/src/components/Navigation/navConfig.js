/** Primary top-nav destinations (single row). Settings sits after More in the shell. */
export const NAV_PRIMARY_LINKS = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    isActive: (pathname) => pathname === '/dashboard',
  },
  {
    to: '/chat',
    label: 'Chat',
    isActive: (pathname) => pathname === '/chat' || pathname.startsWith('/chat/'),
  },
  {
    to: '/explore',
    label: 'Models',
    isActive: (pathname) => pathname === '/explore' || pathname.startsWith('/models/'),
  },
];

/** Settings link placed after More, before theme toggle / avatar. */
export const NAV_SETTINGS_LINK = {
  to: '/settings',
  label: 'Settings',
  isActive: (pathname) => pathname === '/settings' || pathname.startsWith('/settings/'),
};

export const NAV_MORE_GROUPS = [
  {
    id: 'ai-learning',
    title: 'AI & Learning',
    items: [
      { to: '/ai-training', label: 'AI Training Course', description: 'Structured lessons and exercises' },
      { to: '/ai-learning', label: 'AI Learning Lab', description: 'Interactive learning workspace' },
      { to: '/python-ai', label: 'PyTorch Lab', description: 'Local ML experiments and training' },
      { to: '/knowledge', label: 'Knowledge Base', description: 'Documents and retrieval for chat' },
      { to: '/ai-files', label: 'AI Files', description: 'Secure document upload and grounded Q&A' },
      { to: '/evaluation-lab', label: 'AI Evaluation Lab', description: 'Comparable model evaluation runs' },
    ],
  },
  {
    id: 'workspace',
    title: 'Workspace',
    items: [
      { to: '/storage', label: 'Storage Hub', description: 'Saved prompts, files, and ideas' },
      { to: '/ai-workflows', label: 'AI Workflows', description: 'Multi-step AI task pipelines' },
      { to: '/next-20', label: 'Workspace Tools', description: 'Productivity and builder utilities' },
      { to: '/studio', label: 'Studio', description: 'Creative and production workflows' },
      { to: '/voice-studio', label: 'Voice Studio', description: 'Natural male and female AI voices' },
      { to: '/website-builder', label: 'AI Website Builder', description: 'Generate, preview, and export sites' },
    ],
  },
  {
    id: 'research',
    title: 'Research & Tools',
    items: [
      { to: '/next-9', label: 'Research & Learning', description: 'Deep research experiences' },
      { to: '/next-25', label: 'Workflow Hub', description: 'Multi-step automation flows' },
      { to: '/next-10', label: 'Model Toolkit', description: 'Compare and evaluate models' },
      { to: '/arena', label: 'Arena', description: 'Side-by-side model battles' },
      { to: '/model-comparison', label: 'Model Comparison', description: 'Structured comparisons' },
      { to: '/usage-analytics', label: 'Usage Analytics', description: 'Usage and cost insights' },
      { to: '/provider-health', label: 'Provider Health', description: 'AI provider availability and latency' },
    ],
  },
  {
    id: 'platform',
    title: 'Platform',
    items: [
      { to: '/ai-platform', label: 'AI Platform', description: 'Platform overview and jobs' },
      { to: '/ai-tools', label: 'Power Lab', description: 'Advanced AI utilities' },
      { to: '/creator-tools', label: 'Creator Lab', description: 'Creator-focused tools' },
      { to: '/features', label: 'Features', description: 'Product capability map' },
      { to: '/control-center', label: 'Control Center', description: 'Workspace control panel' },
      { to: '/innovation-hub', label: 'Innovation Hub', description: 'Experiments and previews' },
    ],
  },
  {
    id: 'developer',
    title: 'Developer',
    requiresDeveloper: true,
    items: [
      { to: '/builder-25', label: 'Developer Toolkit', description: 'Builder utilities for developers' },
      { to: '/developer/model-diagnostics', label: 'Model Diagnostics', description: 'Live provider health checks' },
      { to: '/developer/ai-learning', label: 'AI Learning Dashboard', description: 'Router and intelligence telemetry' },
      { to: '/model-lab', label: 'Model Lab', description: 'Model experimentation' },
      { to: '/admin', label: 'Admin', description: 'Administrative tools', requiresOwner: true },
    ],
  },
];

export function flattenMoreItems(groups, { canUseDeveloper = false, isOwner = false } = {}) {
  return groups.flatMap((group) => {
    if (group.requiresDeveloper && !canUseDeveloper) return [];
    return group.items
      .filter((item) => !(item.requiresOwner && !isOwner))
      .map((item) => ({ ...item, group: group.title }));
  });
}

export function isMoreMenuActive(pathname, options) {
  const flat = flattenMoreItems(NAV_MORE_GROUPS, options);
  return flat.some(
    (item) => pathname === item.to || (item.to !== '/' && pathname.startsWith(`${item.to}/`)),
  );
}

export const NAV_MOBILE_DOCK = [
  { to: '/dashboard', label: 'Dashboard', match: (p) => p === '/dashboard' },
  { to: '/chat', label: 'Chat', match: (p) => p.startsWith('/chat') },
  { to: '/explore', label: 'Models', match: (p) => p === '/explore' || p.startsWith('/models/') },
  { id: 'more', label: 'More', isMore: true },
  { to: '/settings', label: 'Settings', match: (p) => p === '/settings' || p.startsWith('/settings/') },
  { id: 'profile', label: 'Profile', isProfile: true },
];
