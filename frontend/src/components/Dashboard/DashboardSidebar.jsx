import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { DASHBOARD_NAV_GROUPS } from './dashboardNavGroups';
import DashboardIcon, { SIDEBAR_ICON_BY_LABEL } from './DashboardIcons';

const STORAGE_KEY = 'allmodelai_dashboard_sidebar_collapsed';

export default function DashboardSidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === '1' || saved === '0') return saved === '1';
      return window.matchMedia('(max-width: 1440px)').matches;
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState(() => (
    Object.fromEntries(DASHBOARD_NAV_GROUPS.map((group) => [group.id, true]))
  ));

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
          {!collapsed ? <span className="dashboard-sidebar-title">Navigate</span> : null}
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
          {DASHBOARD_NAV_GROUPS.map((group) => (
            <div key={group.id} className="dashboard-sidebar-group">
              {!collapsed ? (
                <button
                  type="button"
                  className="dashboard-sidebar-group-label"
                  aria-expanded={openGroups[group.id] !== false}
                  onClick={() => setOpenGroups((current) => ({
                    ...current,
                    [group.id]: current[group.id] === false,
                  }))}
                >
                  {group.label}
                </button>
              ) : (
                <div className="dashboard-sidebar-group-rule" aria-hidden="true" />
              )}
              {(collapsed || openGroups[group.id] !== false) && group.items.map((item) => {
                const active =
                  location.pathname === item.to
                  || (item.to !== '/dashboard' && location.pathname.startsWith(item.to));
                const iconName = SIDEBAR_ICON_BY_LABEL[item.label] || 'spark';
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`dashboard-sidebar-link${active ? ' dashboard-sidebar-link--active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                    title={collapsed ? item.label : undefined}
                    data-tooltip={collapsed ? item.label : undefined}
                    onClick={() => setMobileOpen(false)}
                  >
                    <span className="dashboard-sidebar-icon" aria-hidden="true">
                      <DashboardIcon name={iconName} size={16} />
                    </span>
                    <span className="dashboard-sidebar-label">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
