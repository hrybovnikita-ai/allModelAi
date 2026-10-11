import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import { normalizeCreditStatus } from '../../lib/creditStatus';
import { useSession } from '../Session/SessionProvider';
import { AllModelAILogoMark } from '../AllModelAILogo/AllModelAILogo';
import { isMoreMenuActive, NAV_PRIMARY_LINKS } from './navConfig';
import NavMoreMenu from './NavMoreMenu';
import NavProfileMenu from './NavProfileMenu';
import { useNavCompact } from './useNavCompact';
import './FloatingGlassNav.css';

export default function FloatingGlassNav() {
  const location = useLocation();
  const { user: sessionUser, authLoading } = useSession();
  const user = sessionUser;
  const { sentinelRef, compact } = useNavCompact();
  const [moreOpen, setMoreOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [creditStatus, setCreditStatus] = useState(null);

  useEffect(() => {
    if (!user?.email) return undefined;
    let active = true;
    void apiFetch('/api/credits')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (active && data) setCreditStatus(normalizeCreditStatus(data));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user?.email]);

  useEffect(() => {
    setMoreOpen(false);
    setProfileOpen(false);
  }, [location.pathname]);

  const handleMoreOpenChange = useCallback((next) => {
    setMoreOpen(next);
    if (next) setProfileOpen(false);
  }, []);

  const handleProfileOpenChange = useCallback((next) => {
    setProfileOpen(next);
    if (next) setMoreOpen(false);
  }, []);

  if (authLoading && !user?.email) {
    return (
      <div className="fg-nav-shell" aria-hidden="true">
        <div className="fg-nav-sentinel" />
        <header className="fg-nav fg-nav--loading">
          <div className="fg-nav-glass">
            <span className="fg-nav-loading">Checking your session…</span>
          </div>
        </header>
      </div>
    );
  }

  if (!user?.email) return null;

  const canUseDeveloper = Boolean(creditStatus?.canUseDeveloper);
  const isOwner = Boolean(creditStatus?.isOwner);
  const moreActive = isMoreMenuActive(location.pathname, { canUseDeveloper, isOwner });

  return (
    <div className="fg-nav-shell">
      <div ref={sentinelRef} className="fg-nav-sentinel" aria-hidden="true" />
      <header
        className={`fg-nav${compact ? ' fg-nav--compact' : ''}`}
        role="banner"
      >
        <div className="fg-nav-glass">
          <Link to="/dashboard" className="fg-nav-brand" onClick={() => { setMoreOpen(false); setProfileOpen(false); }}>
            <AllModelAILogoMark size={34} />
            <span>AllModelAI</span>
          </Link>

          <nav className="fg-nav-center" aria-label="Main navigation">
            {NAV_PRIMARY_LINKS.map((item) => {
              const active = item.isActive(location.pathname);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`fg-nav-link${active ? ' fg-nav-link--active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => { setMoreOpen(false); setProfileOpen(false); }}
                >
                  {item.label}
                </Link>
              );
            })}
            <NavMoreMenu
              open={moreOpen}
              onOpenChange={handleMoreOpenChange}
              canUseDeveloper={canUseDeveloper}
              isOwner={isOwner}
              align="center"
              moreActive={moreActive}
              renderTrigger
            />
          </nav>

          <div className="fg-nav-right">
            <NavProfileMenu
              user={user}
              creditStatus={creditStatus}
              open={profileOpen}
              onOpenChange={handleProfileOpenChange}
              showSettingsShortcut
            />
          </div>
        </div>
      </header>
    </div>
  );
}
