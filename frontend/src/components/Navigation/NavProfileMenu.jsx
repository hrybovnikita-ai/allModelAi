import { useEffect, useId, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { performLogout } from '../../lib/session';
import { formatSubscriptionPlanLabel } from '../../lib/planLabels';
import NavSettingsIcon from './NavSettingsIcon';

export default function NavProfileMenu({
  user,
  creditStatus,
  open,
  onOpenChange,
  showSettingsShortcut = false,
  renderTrigger = true,
}) {
  const menuId = useId();
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const onOpenChangeRef = useRef(onOpenChange);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onOpenChangeRef.current(false);
        triggerRef.current?.focus();
      }
    };
    const onPointerDown = (event) => {
      if (rootRef.current?.contains(event.target)) return;
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

  const signOut = async () => {
    onOpenChange(false);
    await performLogout();
    navigate('/', { replace: true });
  };

  const planLabel = creditStatus?.isOwner
    ? 'Owner'
    : formatSubscriptionPlanLabel(creditStatus || {});

  const avatarLetter = user?.name?.charAt(0) || user?.email?.charAt(0) || '?';

  return (
    <div className="fg-nav-profile-wrap" ref={rootRef}>
      {showSettingsShortcut && renderTrigger ? (
        <Link to="/settings" className="fg-nav-settings-link" aria-label="Settings">
          <NavSettingsIcon size={18} />
        </Link>
      ) : null}
      {renderTrigger ? (
        <button
          ref={triggerRef}
          type="button"
          className="fg-nav-profile-trigger"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-controls={menuId}
          aria-label="Account menu"
          onClick={() => onOpenChange(!open)}
        >
          <span className="fg-nav-profile-avatar" aria-hidden="true">
            {user?.avatar ? (
              <img src={user.avatar} alt="" referrerPolicy="no-referrer" />
            ) : (
              avatarLetter
            )}
          </span>
          <span className="fg-nav-profile-name">{user?.name || user?.email}</span>
        </button>
      ) : null}
      {open ? (
        <div className="fg-nav-profile-panel" id={menuId} role="menu" aria-label="Account">
          <div className="fg-nav-profile-head">
            <span className="fg-nav-profile-avatar fg-nav-profile-avatar--lg" aria-hidden="true">
              {user?.avatar ? (
                <img src={user.avatar} alt="" referrerPolicy="no-referrer" />
              ) : (
                avatarLetter
              )}
            </span>
            <div>
              <strong>{user?.name || 'Account'}</strong>
              <small>{user?.email}</small>
              {creditStatus ? <em>{planLabel} plan</em> : null}
            </div>
          </div>
          <Link to="/settings" role="menuitem" className="fg-nav-profile-item" onClick={() => onOpenChange(false)}>
            Settings
          </Link>
          <Link
            to="/settings#settings-security"
            role="menuitem"
            className="fg-nav-profile-item"
            onClick={() => onOpenChange(false)}
          >
            Security
          </Link>
          <Link to="/credits" role="menuitem" className="fg-nav-profile-item" onClick={() => onOpenChange(false)}>
            Subscription & credits
          </Link>
          <button type="button" role="menuitem" className="fg-nav-profile-item fg-nav-profile-signout" onClick={() => { void signOut(); }}>
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
