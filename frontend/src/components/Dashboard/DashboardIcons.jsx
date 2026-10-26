/** Inline SVG icons (Lucide-style) — no extra dependencies. */
const paths = {
  layout: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </>
  ),
  message: (
    <>
      <path d="M21 11.5a8.38 8.38 0 0 1-9 8.5 8.5 8.5 0 1 1 7.5-8.5" />
      <path d="M8 12h.01M12 12h.01M16 12h.01" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
    </>
  ),
  book: (
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </>
  ),
  zap: (
    <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
  ),
  wrench: (
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </>
  ),
  sparkles: (
    <>
      <path d="m12 3-1.5 4.5L6 9l4.5 1.5L12 15l1.5-4.5L18 9l-4.5-1.5L12 3z" />
      <path d="M5 3v4M3 5h4M19 17v4M17 19h4" />
    </>
  ),
  workflow: (
    <>
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="15" y="3" width="6" height="6" rx="1" />
      <rect x="9" y="15" width="6" height="6" rx="1" />
      <path d="M6 9v3h6v3M18 9v3h-6v3" />
    </>
  ),
  flask: (
    <>
      <path d="M10 2v6l-4 9a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l-4-9V2" />
      <path d="M8.5 2h7" />
    </>
  ),
  box: (
    <>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </>
  ),
  swords: (
    <>
      <path d="m14.5 17.5 3 3M3 3l7 7M3 10l7-7M10 3 3 10" />
      <path d="m21 3-9 9M12 12l9 9" />
    </>
  ),
  cpu: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" />
    </>
  ),
  palette: (
    <>
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <path d="M12 2a10 10 0 1 0 10 10c0-2.5-2-4-4-4h-1.5a1.5 1.5 0 0 1-1.4-2 2 2 0 0 0-3.86-.7A2 2 0 0 0 12 2z" />
    </>
  ),
  layers: (
    <>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </>
  ),
  sliders: (
    <>
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </>
  ),
  spark: (
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
  ),
  router: (
    <>
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="6" r="2" />
      <path d="M8 18h8a4 4 0 0 0 4-4V8" />
      <path d="M6 16V8a4 4 0 0 1 4-4h6" />
    </>
  ),
  brain: (
    <>
      <path d="M12 5a3 3 0 1 0-5.995.125A4 4 0 0 0 4 9v1a3 3 0 0 0 3 3" />
      <path d="M12 5a3 3 0 1 1 5.995.125A4 4 0 0 1 20 9v1a3 3 0 0 1-3 3" />
      <path d="M12 14v7" />
    </>
  ),
};

export const SIDEBAR_ICON_BY_LABEL = {
  Dashboard: 'layout',
  Profile: 'user',
  Settings: 'settings',
  Chat: 'message',
  'Storage Hub': 'database',
  'AI Training Course': 'book',
  'AI Learning Lab': 'sparkles',
  'PyTorch Lab': 'zap',
  'Developer Toolkit': 'wrench',
  'Workspace Tools': 'grid',
  Models: 'compass',
  Studio: 'sparkles',
  'AI Workflows': 'workflow',
  'Research & Learning': 'flask',
  'Model Toolkit': 'box',
  'AI Platform': 'cpu',
  'Website Builder': 'globe',
  Arena: 'swords',
  'Power Lab': 'zap',
  'Creator Lab': 'palette',
  Features: 'layers',
  Control: 'sliders',
};

export const QUICK_ACTION_ICON = {
  chat: 'message',
  smart: 'router',
  arena: 'swords',
  studio: 'sparkles',
  models: 'compass',
  knowledge: 'book',
  settings: 'settings',
};

export default function DashboardIcon({ name = 'spark', size = 20, className = '' }) {
  const content = paths[name] || paths.spark;
  return (
    <svg
      className={['dashboard-icon', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      style={{ '--icon-size': `${size}px` }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {content}
    </svg>
  );
}
