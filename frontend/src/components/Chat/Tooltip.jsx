import { cloneElement, useCallback, useEffect, useId, useRef, useState } from 'react';

const SHOW_DELAY_MS = 420;
const HIDE_DELAY_MS = 80;

export default function Tooltip({ label, children, disabled = false }) {
  const tooltipId = useId();
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const showTimer = useRef(null);
  const hideTimer = useRef(null);
  const anchorRef = useRef(null);

  const clearTimers = () => {
    if (showTimer.current) window.clearTimeout(showTimer.current);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    showTimer.current = null;
    hideTimer.current = null;
  };

  const positionTooltip = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const margin = 8;
    const estimatedWidth = Math.min(240, Math.max(72, label.length * 7 + 24));
    let left = rect.left + rect.width / 2 - estimatedWidth / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - estimatedWidth - margin));
    let top = rect.top - margin;
    setCoords({ top, left, width: estimatedWidth, placement: 'top' });
  }, [label]);

  const show = () => {
    if (disabled || !label) return;
    clearTimers();
    showTimer.current = window.setTimeout(() => {
      positionTooltip();
      setVisible(true);
    }, SHOW_DELAY_MS);
  };

  const hide = () => {
    clearTimers();
    hideTimer.current = window.setTimeout(() => setVisible(false), HIDE_DELAY_MS);
  };

  useEffect(() => () => clearTimers(), []);

  useEffect(() => {
    if (!visible) return undefined;
    const onScroll = () => positionTooltip();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [visible, positionTooltip]);

  const child = cloneElement(children, {
    ref: (node) => {
      anchorRef.current = node;
      const { ref } = children;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    'aria-describedby': visible ? tooltipId : undefined,
    onMouseEnter: (event) => {
      children.props.onMouseEnter?.(event);
      show();
    },
    onMouseLeave: (event) => {
      children.props.onMouseLeave?.(event);
      hide();
    },
    onFocus: (event) => {
      children.props.onFocus?.(event);
      show();
    },
    onBlur: (event) => {
      children.props.onBlur?.(event);
      hide();
    },
  });

  return (
    <>
      {child}
      {visible && label && (
        <span
          id={tooltipId}
          role="tooltip"
          className="ama-tooltip"
          style={{
            top: coords.top,
            left: coords.left,
            width: coords.width,
            transform: 'translateY(-100%)',
          }}
        >
          {label}
        </span>
      )}
    </>
  );
}
