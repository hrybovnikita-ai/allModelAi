import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { DASHBOARD_NAV_GROUPS, NAV_GROUP_ICONS } from '../Dashboard/dashboardNavGroups';
import DashboardIcon, { SIDEBAR_ICON_BY_LABEL } from '../Dashboard/DashboardIcons';
import { useWorkspaceNavDrawer } from './WorkspaceNavDrawerContext';
import './WorkspaceNavDrawer.css';

function isActivePath(pathname, to) {
  const pathOnly = to.split('#')[0];
  if (pathname === pathOnly) return true;
  if (pathOnly === '/dashboard') return pathname === '/dashboard';
  return pathOnly !== '/' && pathname.startsWith(pathOnly);
}

export default function WorkspaceNavDrawer() {
  const { open, close } = useWorkspaceNavDrawer();
  const location = useLocation();
  const searchRef = useRef(null);
  const [query, setQuery] = useState('');
  const [openGroups, setOpenGroups] = useState(() => (
    Object.fromEntries(DASHBOARD_NAV_GROUPS.map((group) => [group.id, true]))
  ));

  const normalizedQuery = query.trim().toLowerCase();

  const filteredGroups = useMemo(() => {
    if (!normalizedQuery) return DASHBOARD_NAV_GROUPS;
    return DASHBOARD_NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => item.label.toLowerCase().includes(normalizedQuery)
          || group.label.toLowerCase().includes(normalizedQuery),
      ),
    })).filter((group) => group.items.length > 0);
  }, [normalizedQuery]);

  useEffect(() => {
    close();
    setQuery('');
  }, [location.pathname, close]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => searchRef.current?.focus(), 120);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  useEffect(() => {
    setOpenGroups((current) => {
      const next = { ...current };
      for (const group of DASHBOARD_NAV_GROUPS) {
        const hasActive = group.items.some((item) => isActivePath(location.pathname, item.to));
        if (hasActive) next[group.id] = true;
      }
      return next;
    });
  }, [location.pathname]);

  const toggleGroup = useCallback((groupId) => {
    setOpenGroups((current) => ({
      ...current,
      [groupId]: current[groupId] === false,
    }));
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <button
        type="button"
        className={`workspace-nav-backdrop${open ? ' workspace-nav-backdrop--open' : ''}`}
        aria-label="Close navigation menu"
        tabIndex={open ? 0 : -1}
        onClick={close}
      />
      <aside
        id="workspace-nav-drawer"
        className={`workspace-nav-drawer${open ? ' workspace-nav-drawer--open' : ''}`}
        aria-label="Application navigation"
        aria-hidden={!open}
      >
        <header className="workspace-nav-drawer-head">
          <div>
            <p className="workspace-nav-drawer-eyebrow">AllModelAI</p>
            <h2 className="workspace-nav-drawer-title">Menu</h2>
          </div>
          <button
            type="button"
            className="workspace-nav-drawer-close"
            aria-label="Close menu"
            onClick={close}
          >
            ×
          </button>
        </header>

        <label className="workspace-nav-search">
          <span className="visually-hidden">Search navigation</span>
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder="Search pages…"
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <nav className="workspace-nav-drawer-nav" aria-label="Workspace pages">
          {filteredGroups.length === 0 ? (
            <p className="workspace-nav-empty" role="status">No matches for your search.</p>
          ) : null}
          {filteredGroups.map((group) => {
            const expanded = openGroups[group.id] !== false;
            const groupIcon = NAV_GROUP_ICONS[group.id] || 'grid';
            return (
              <section key={group.id} className="workspace-nav-group">
                <button
                  type="button"
                  className="workspace-nav-group-trigger"
                  aria-expanded={expanded}
                  onClick={() => toggleGroup(group.id)}
                >
                  <span className="workspace-nav-group-icon" aria-hidden="true">
                    <DashboardIcon name={groupIcon} size={18} />
                  </span>
                  <span className="workspace-nav-group-label">{group.label}</span>
                  <span className="workspace-nav-group-chevron" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
                </button>
                {expanded ? (
                  <ul className="workspace-nav-group-items">
                    {group.items.map((item) => {
                      const active = isActivePath(location.pathname, item.to);
                      const iconName = SIDEBAR_ICON_BY_LABEL[item.label] || 'spark';
                      return (
                        <li key={item.to}>
                          <Link
                            to={item.to}
                            className={`workspace-nav-link${active ? ' workspace-nav-link--active' : ''}`}
                            aria-current={active ? 'page' : undefined}
                            onClick={close}
                          >
                            <span className="workspace-nav-link-icon" aria-hidden="true">
                              <DashboardIcon name={iconName} size={16} />
                            </span>
                            {item.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </section>
            );
          })}
        </nav>
      </aside>
    </>,
    document.body,
  );
}
