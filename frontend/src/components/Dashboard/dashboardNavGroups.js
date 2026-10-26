import {
  DASHBOARD_NAV_ACCOUNT_LINKS,
  DASHBOARD_NAV_LINKS,
} from './dashboardNavLinks';

const byLabel = (labels) => DASHBOARD_NAV_LINKS.filter((item) => labels.includes(item.label));

/** Sidebar navigation grouped by workspace area (all routes preserved). */
export const DASHBOARD_NAV_GROUPS = [
  {
    id: 'account',
    label: 'Account',
    items: DASHBOARD_NAV_ACCOUNT_LINKS,
  },
  {
    id: 'chat',
    label: 'Chat & models',
    items: byLabel(['Chat', 'Models', 'Arena', 'Studio']),
  },
  {
    id: 'learn',
    label: 'Learning & labs',
    items: byLabel([
      'AI Training Course',
      'AI Learning Lab',
      'PyTorch Lab',
      'Research & Learning',
    ]),
  },
  {
    id: 'build',
    label: 'Build & automate',
    items: byLabel([
      'Developer Toolkit',
      'Workspace Tools',
      'AI Workflows',
      'Model Toolkit',
      'AI Platform',
      'Website Builder',
    ]),
  },
  {
    id: 'labs',
    label: 'Creative labs',
    items: byLabel(['Power Lab', 'Creator Lab', 'Features', 'Control']),
  },
  {
    id: 'storage',
    label: 'Data',
    items: byLabel(['Storage Hub']),
  },
];
