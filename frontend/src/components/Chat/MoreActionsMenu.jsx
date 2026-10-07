import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const MOBILE_MAX = 640;
const VIEWPORT_MARGIN = 12;

function useIsMobile() {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(`(max-width: ${MOBILE_MAX}px)`).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_MAX}px)`);
    const onChange = () => setMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return mobile;
}

function MenuItem({ item, onSelect }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      role="menuitem"
      className={[
        'message-more-menu-item',
        item.className,
        item.danger ? 'is-danger' : '',
        item.separatorBefore ? 'has-separator' : '',
      ].filter(Boolean).join(' ')}
      disabled={item.disabled}
      onClick={() => onSelect(item)}
    >
      <span className="message-more-menu-icon" aria-hidden="true">
        {Icon ? <Icon /> : null}
      </span>
      <span className="message-more-menu-copy">
        <span className="message-more-menu-label">{item.label}</span>
        {item.description && (
          <span className="message-more-menu-desc">{item.description}</span>
        )}
      </span>
    </button>
  );
}

export default function MoreActionsMenu({ anchorRef, open, onClose, items }) {
  const menuId = useId();
  const menuRef = useRef(null);
  const isMobile = useIsMobile();
  const [position, setPosition] = useState(null);

  const visibleItems = items.filter((item) => item && !item.hidden);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    const anchor = anchorRef?.current;
    const menu = menuRef.current;
    if (!anchor || !menu) return;

    if (isMobile) {
      setPosition({ mode: 'sheet' });
      return;
    }

    menu.style.visibility = 'hidden';
    menu.style.pointerEvents = 'none';
    menu.style.display = 'flex';

    const anchorRect = anchor.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const gap = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top = anchorRect.bottom + gap;
    if (top + menuRect.height > vh - VIEWPORT_MARGIN) {
      top = anchorRect.top - menuRect.height - gap;
    }
    top = Math.max(VIEWPORT_MARGIN, Math.min(top, vh - menuRect.height - VIEWPORT_MARGIN));

    let left = anchorRect.right - menuRect.width;
    if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
    if (left + menuRect.width > vw - VIEWPORT_MARGIN) {
      left = vw - menuRect.width - VIEWPORT_MARGIN;
    }

    menu.style.visibility = '';
    menu.style.pointerEvents = '';
    setPosition({ mode: 'popover', top, left });
  }, [open, anchorRef, isMobile, visibleItems.length]);

  useEffect(() => {
    if (!open) return undefined;

    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    const onPointer = (event) => {
      const menu = menuRef.current;
      const anchor = anchorRef?.current;
      if (menu?.contains(event.target) || anchor?.contains(event.target)) return;
      onClose();
    };

    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open, onClose, anchorRef]);

  useEffect(() => {
    if (!open || !menuRef.current) return;
    const first = menuRef.current.querySelector('.message-more-menu-item:not(:disabled)');
    first?.focus();
  }, [open, visibleItems.length]);

  if (!open) return null;

  const handleSelect = (item) => {
    item.onClick();
    onClose();
  };

  const menuTree = (
    <>
      {isMobile && (
        <button
          type="button"
          className="message-more-menu-backdrop"
          aria-label="Close menu"
          tabIndex={-1}
          onClick={onClose}
        />
      )}
      <div
        ref={menuRef}
        id={menuId}
        className={`message-more-menu ${isMobile ? 'is-mobile-sheet' : 'is-popover'}`}
        role="menu"
        aria-label="More response actions"
        style={
          position?.mode === 'popover'
            ? { top: position.top, left: position.left }
            : undefined
        }
      >
        {visibleItems.map((item) => (
          <MenuItem key={item.id} item={item} onSelect={handleSelect} />
        ))}
      </div>
    </>
  );

  return createPortal(menuTree, document.body);
}
