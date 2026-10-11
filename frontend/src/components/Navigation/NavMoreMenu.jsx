import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { flattenMoreItems, NAV_MORE_GROUPS } from './navConfig';

function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function NavMoreMenu({
  open,
  onOpenChange,
  canUseDeveloper,
  isOwner,
  align = 'center',
  renderTrigger = true,
  moreActive = false,
}) {
  const menuId = useId();
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const onOpenChangeRef = useRef(onOpenChange);
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [panelStyle, setPanelStyle] = useState(null);

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  const groups = useMemo(
    () => NAV_MORE_GROUPS.filter((g) => !(g.requiresDeveloper && !canUseDeveloper)),
    [canUseDeveloper],
  );

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (item.requiresOwner && !isOwner) return false;
          const blob = `${item.label} ${item.description || ''} ${group.title}`.toLowerCase();
          return blob.includes(q);
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, query, isOwner]);

  const updatePanelPosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const panelWidth = Math.min(360, window.innerWidth - 24);
    let left = rect.left + rect.width / 2;
    const half = panelWidth / 2;
    left = Math.max(12 + half, Math.min(window.innerWidth - 12 - half, left));
    setPanelStyle({
      position: 'fixed',
      top: rect.bottom + 10,
      left,
      width: panelWidth,
      transform: 'translateX(-50%)',
      zIndex: 500,
    });
  };

  useLayoutEffect(() => {
    if (!open || align === 'bottom') {
      setPanelStyle(null);
      return undefined;
    }
    updatePanelPosition();
    const onLayout = () => updatePanelPosition();
    window.addEventListener('resize', onLayout);
    window.addEventListener('scroll', onLayout, true);
    return () => {
      window.removeEventListener('resize', onLayout);
      window.removeEventListener('scroll', onLayout, true);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return undefined;
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onOpenChangeRef.current(false);
        triggerRef.current?.focus();
      }
    };
    const onPointerDown = (event) => {
      const target = event.target;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      onOpenChangeRef.current(false);
    };
    const attachId = window.requestAnimationFrame(() => {
      document.addEventListener('keydown', onKeyDown);
      document.addEventListener('pointerdown', onPointerDown, true);
    });
    return () => {
      window.cancelAnimationFrame(attachId);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open]);

  useEffect(() => {
    onOpenChangeRef.current(false);
  }, [location.pathname]);

  const flatForEmpty = flattenMoreItems(NAV_MORE_GROUPS, { canUseDeveloper, isOwner });

  const closeMenu = () => onOpenChangeRef.current(false);

  const panelBody = (
    <>
      <div className="fg-nav-more-search">
        <IconSearch />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search navigation…"
          aria-label="Filter navigation"
          autoComplete="off"
        />
      </div>
      <div className="fg-nav-more-scroll">
        {filteredGroups.length === 0 ? (
          <p className="fg-nav-more-empty">No matches. Try another keyword.</p>
        ) : (
          filteredGroups.map((group) => (
            <section key={group.id} className="fg-nav-more-group" aria-label={group.title}>
              <h3>{group.title}</h3>
              <ul>
                {group.items
                  .filter((item) => !(item.requiresOwner && !isOwner))
                  .map((item) => (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        role="menuitem"
                        className="fg-nav-more-item"
                        onClick={closeMenu}
                      >
                        <span className="fg-nav-more-item-label">{item.label}</span>
                        {item.description ? (
                          <span className="fg-nav-more-item-desc">{item.description}</span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
              </ul>
            </section>
          ))
        )}
      </div>
      {!query && flatForEmpty.length === 0 ? (
        <p className="fg-nav-more-empty">No additional destinations for this account.</p>
      ) : null}
    </>
  );

  return (
    <div className={`fg-nav-more fg-nav-more--${align}`} ref={rootRef}>
      {renderTrigger ? (
        <button
          ref={triggerRef}
          type="button"
          className={`fg-nav-link fg-nav-more-trigger${open || moreActive ? ' fg-nav-link--active' : ''}`}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-controls={menuId}
          onClick={() => onOpenChange(!open)}
        >
          More
          <span className="fg-nav-more-chevron" aria-hidden="true">▾</span>
        </button>
      ) : null}
      {open ? (
        align === 'bottom' ? (
          <div
            ref={panelRef}
            className="fg-nav-more-panel fg-nav-more-panel--sheet"
            id={menuId}
            role="menu"
            aria-label="More destinations"
          >
            {panelBody}
          </div>
        ) : panelStyle ? (
          createPortal(
            <div
              ref={panelRef}
              className="fg-nav-more-panel fg-nav-more-panel--portal"
              id={menuId}
              role="menu"
              aria-label="More destinations"
              style={panelStyle}
            >
              {panelBody}
            </div>,
            document.body,
          )
        ) : null
      ) : null}
    </div>
  );
}
