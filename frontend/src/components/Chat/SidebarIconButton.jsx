import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';

export default function SidebarIconButton({
  label,
  className = '',
  active = false,
  onClick,
  children,
}) {
  const [tip, setTip] = useState(null);

  const showTip = useCallback((event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setTip({
      text: label,
      top: rect.top + rect.height / 2,
      left: rect.right + 12,
    });
  }, [label]);

  const hideTip = useCallback(() => setTip(null), []);

  return (
    <>
      <button
        type="button"
        className={`${className}${active ? ' active' : ''}`}
        aria-label={label}
        onClick={onClick}
        onMouseEnter={showTip}
        onMouseLeave={hideTip}
        onFocus={showTip}
        onBlur={hideTip}
      >
        {children}
      </button>
      {tip && createPortal(
        <div
          className="sidebar-floating-tooltip"
          style={{ top: tip.top, left: tip.left }}
          role="tooltip"
        >
          {tip.text}
        </div>,
        document.body,
      )}
    </>
  );
}
