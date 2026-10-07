import Tooltip from './Tooltip';

export default function ActionButton({
  label,
  tooltip,
  onClick,
  disabled = false,
  active = false,
  activeVariant = '',
  className = '',
  children,
  ariaExpanded,
  ariaHaspopup,
  buttonRef,
}) {
  const classes = [
    'message-action-btn',
    active ? 'is-active' : '',
    activeVariant,
    className,
  ].filter(Boolean).join(' ');

  return (
    <Tooltip label={tooltip || label} disabled={disabled}>
      <button
        type="button"
        ref={buttonRef}
        className={classes}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-expanded={ariaExpanded}
        aria-haspopup={ariaHaspopup}
      >
        {children}
      </button>
    </Tooltip>
  );
}
