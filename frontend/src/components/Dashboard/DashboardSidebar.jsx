import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { DASHBOARD_NAV_LINKS } from './dashboardNavLinks';

const STORAGE_KEY = 'allmodelai_dashboard_sidebar_collapsed';

const SIDEBAR_ICONS = {
  Dashboard: '◆',
  Profile: '◎',
  Settings: '⚙',
  Chat: '💬',
  'Storage Hub': '▦',
  'AI Training Course': '📚',
  'AI Learning Lab': '✦',
  'PyTorch Lab': '⚡',
  'Developer Toolkit': '🛠',
  'Workspace Tools': '▤',
  Models: '◇',
  Studio: '✨',
  'AI Workflows': '↻',
  'Research & Learning': '🔬',
  'Model Toolkit': '🧰',
  'AI Platform': '⬡',
  'Website Builder': '🌐',
  Arena: '⚔',
  'Power Lab': '⚡',
  'Creator Lab': '🎨',
  Features: '＋',
  Control: '◎',
};

export default function DashboardSidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const sidebarClass = [
    'dashboard-sidebar',
    collapsed ? 'dashboard-sidebar--collapsed' : '',
    mobileOpen ? 'dashboard-sidebar--mobile-open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <button
        type="button"
        className="dashboard-sidebar-mobile-trigger"
        aria-expanded={mobileOpen}
        aria-controls="dashboard-sidebar-nav"
        onClick={() => setMobileOpen((open) => !open)}
      >
        {mobileOpen ? 'Close menu' : 'Menu'}
      </button>
      {mobileOpen ? (
        <button
          type="button"
          className="dashboard-sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}
      <aside className={sidebarClass} aria-label="Dashboard navigation">
        <div className="dashboard-sidebar-head">
          {!collapsed ? <span className="dashboard-sidebar-title">Workspace</span> : null}
          <button
            type="button"
            className="dashboard-sidebar-collapse"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={toggleCollapsed}
          >
            {collapsed ? '»' : '«'}
          </button>
        </div>
        <nav id="dashboard-sidebar-nav" className="dashboard-sidebar-nav">
          {DASHBOARD_NAV_LINKS.map((item) => {
            const active =
              location.pathname === item.to
              || (item.to !== '/dashboard' && location.pathname.startsWith(item.to));
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`dashboard-sidebar-link${active ? ' dashboard-sidebar-link--active' : ''}`}
                aria-current={active ? 'page' : undefined}
                title={collapsed ? item.label : undefined}
                onClick={() => setMobileOpen(false)}
              >
                <span className="dashboard-sidebar-icon" aria-hidden="true">
                  {SIDEBAR_ICONS[item.label] || '•'}
                </span>
                <span className="dashboard-sidebar-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
