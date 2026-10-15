import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import './ConfirmDialog.css';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible confirmation dialog (ChatGPT-style layout, AllModelAI theme).
 */
export default function ConfirmDialog({
  open = true,
  title = 'Confirm',
  description = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = true,
  loading = false,
  error = '',
  onConfirm,
  onCancel,
  closeOnBackdrop = true,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);
  const confirmBtnRef = useRef(null);
  const previouslyFocusedRef = useRef(null);
  const confirmLockRef = useRef(false);

  useEffect(() => {
    if (!loading) confirmLockRef.current = false;
  }, [loading]);

  useEffect(() => {
    if (!open) {
      confirmLockRef.current = false;
      return undefined;
    }

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      const root = dialogRef.current;
      if (!root) return;
      const preferred = confirmBtnRef.current;
      const first = root.querySelector(FOCUSABLE);
      (preferred || first)?.focus?.();
    }, 0);

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (loading) return;
        event.preventDefault();
        onCancel?.();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const nodes = [...dialogRef.current.querySelectorAll(FOCUSABLE)].filter(
        (node) => node instanceof HTMLElement && !node.hasAttribute('disabled'),
      );
      if (!nodes.length) {
        event.preventDefault();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      const prev = previouslyFocusedRef.current;
      if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
        prev.focus();
      }
    };
  }, [open, loading, onCancel]);

  if (!open) return null;

  const handleBackdropMouseDown = (event) => {
    if (!closeOnBackdrop || loading) return;
    if (event.target === event.currentTarget) onCancel?.();
  };

  const handleConfirmClick = () => {
    if (loading || confirmLockRef.current) return;
    confirmLockRef.current = true;
    onConfirm?.();
  };

  return createPortal(
    <div
      className="confirm-dialog-backdrop"
      role="presentation"
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        ref={dialogRef}
        className={`confirm-dialog${destructive ? ' confirm-dialog--destructive' : ''}${loading ? ' confirm-dialog--loading' : ''}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        aria-busy={loading ? 'true' : 'false'}
      >
        <header className="confirm-dialog-header">
          <h2 id={titleId} className="confirm-dialog-title">{title}</h2>
          <button
            type="button"
            className="confirm-dialog-close"
            onClick={() => !loading && onCancel?.()}
            disabled={loading}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {description ? (
          <p id={descriptionId} className="confirm-dialog-description">
            {description}
          </p>
        ) : null}

        {error ? (
          <p className="confirm-dialog-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="confirm-dialog-btn confirm-dialog-btn-cancel"
            onClick={() => !loading && onCancel?.()}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            className={`confirm-dialog-btn confirm-dialog-btn-confirm${destructive ? ' confirm-dialog-btn-confirm--danger' : ''}`}
            onClick={handleConfirmClick}
            disabled={loading}
            aria-disabled={loading ? 'true' : 'false'}
          >
            {loading ? 'Deleting…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
