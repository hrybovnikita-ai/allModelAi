import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import { normalizeCreditStatus } from '../../lib/creditStatus';
import { useSession } from '../Session/SessionProvider';
import { isMoreMenuActive, NAV_MOBILE_DOCK } from './navConfig';
import NavMoreMenu from './NavMoreMenu';
import NavProfileMenu from './NavProfileMenu';
import './FloatingGlassNav.css';

export default function MobileDockNav() {
  const location = useLocation();
  const { user } = useSession();
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

  if (!user?.email) return null;

  const canUseDeveloper = Boolean(creditStatus?.canUseDeveloper);
  const isOwner = Boolean(creditStatus?.isOwner);
  const moreActive = isMoreMenuActive(location.pathname, { canUseDeveloper, isOwner });

  return (
    <>
      <nav className="fg-mobile-dock" aria-label="Mobile navigation">
        <div className="fg-mobile-dock-glass">
          {NAV_MOBILE_DOCK.map((item) => {
            if (item.isMore) {
              return (
                <div key="more" className="fg-mobile-dock-more">
                  <button
                    type="button"
                    className={`fg-mobile-dock-btn${moreOpen || moreActive ? ' fg-mobile-dock-btn--active' : ''}`}
                    aria-expanded={moreOpen}
                    onClick={() => {
                      setMoreOpen((open) => !open);
                      setProfileOpen(false);
                    }}
                  >
                    {item.label}
                  </button>
                </div>
              );
            }
            if (item.isProfile) {
              return (
                <button
                  key="profile"
                  type="button"
                  className={`fg-mobile-dock-btn${profileOpen ? ' fg-mobile-dock-btn--active' : ''}`}
                  aria-label="Profile"
                  onClick={() => {
                    setProfileOpen((open) => !open);
                    setMoreOpen(false);
                  }}
                >
                  {item.label}
                </button>
              );
            }
            const active = item.match(location.pathname);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`fg-mobile-dock-btn${active ? ' fg-mobile-dock-btn--active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
      {moreOpen ? (
        <div className="fg-mobile-dock-overlay">
          <NavMoreMenu
            open={moreOpen}
            onOpenChange={setMoreOpen}
            canUseDeveloper={canUseDeveloper}
            isOwner={isOwner}
            align="bottom"
            renderTrigger={false}
            moreActive={moreActive}
          />
        </div>
      ) : null}
      {profileOpen ? (
        <div className="fg-mobile-dock-overlay fg-mobile-dock-overlay--profile">
          <NavProfileMenu
            user={user}
            creditStatus={creditStatus}
            open={profileOpen}
            onOpenChange={setProfileOpen}
            showSettingsShortcut={false}
            renderTrigger={false}
          />
        </div>
      ) : null}
    </>
  );
}
