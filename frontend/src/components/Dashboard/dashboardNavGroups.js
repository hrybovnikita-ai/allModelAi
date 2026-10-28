import {
  DASHBOARD_NAV_ACCOUNT_LINKS,
  DASHBOARD_NAV_LINKS,
} from './dashboardNavLinks';

const byLabel = (labels) => DASHBOARD_NAV_LINKS.filter((item) => labels.includes(item.label));

const settingsItems = DASHBOARD_NAV_ACCOUNT_LINKS.filter(
  (item) => item.label === 'Profile' || item.label === 'Settings',
);

/** Drawer / sidebar navigation groups (all routes preserved). */
export const DASHBOARD_NAV_GROUPS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    items: byLabel(['Dashboard', 'Workspace Tools']),
  },
  {
    id: 'chat',
    label: 'Chat & Models',
    items: byLabel(['Chat', 'Models', 'Arena', 'Studio']),
  },
  {
    id: 'ai-tools',
    label: 'AI Tools',
    items: byLabel([
      'Power Lab',
      'Creator Lab',
      'Features',
      'Control',
      'AI Workflows',
    ]),
  },
  {
    id: 'development',
    label: 'Development',
    items: byLabel([
      'Developer Toolkit',
      'Model Toolkit',
      'AI Platform',
      'Website Builder',
      'Development Studio',
    ]),
  },
  {
    id: 'learning',
    label: 'Learning',
    items: byLabel([
      'AI Training Course',
      'AI Learning Lab',
      'PyTorch Lab',
      'Research & Learning',
    ]),
  },
  {
    id: 'data',
    label: 'Data & Storage',
    items: byLabel(['Storage Hub']),
  },
  {
    id: 'settings',
    label: 'Account & Settings',
    items: settingsItems.length ? settingsItems : byLabel(['Profile', 'Settings']),
  },
];

export const NAV_GROUP_ICONS = {
  dashboard: 'layout',
  chat: 'message',
  'ai-tools': 'sparkles',
  development: 'wrench',
  learning: 'book',
  data: 'database',
  settings: 'settings',
};
