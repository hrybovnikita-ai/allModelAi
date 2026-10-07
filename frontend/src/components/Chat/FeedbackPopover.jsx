import { useEffect, useId, useRef, useState } from 'react';

const REASONS = [
  'Incorrect',
  'Not helpful',
  'Outdated',
  "Didn't follow instructions",
  'Other',
];

export default function FeedbackPopover({ anchorRef, open, onClose, onSelectReason, initialReason = '' }) {
  const panelId = useId();
  const panelRef = useRef(null);
  const [otherText, setOtherText] = useState('');

  useEffect(() => {
    if (!open) {
      setOtherText('');
      return undefined;
    }
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    const onPointer = (event) => {
      const panel = panelRef.current;
      const anchor = anchorRef?.current;
      if (panel?.contains(event.target) || anchor?.contains(event.target)) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  const submitOther = () => {
    const text = otherText.trim();
    if (!text) return;
    onSelectReason(`Other: ${text}`);
    onClose();
  };

  return (
    <div
      ref={panelRef}
      id={panelId}
      className="message-feedback-popover"
      role="dialog"
      aria-label="Why was this response not helpful?"
    >
      <p className="message-feedback-popover-title">What went wrong?</p>
      <ul className="message-feedback-popover-list">
        {REASONS.map((reason) => (
          <li key={reason}>
            <button
              type="button"
              className={initialReason === reason ? 'is-selected' : ''}
              onClick={() => {
                if (reason === 'Other') return;
                onSelectReason(reason);
                onClose();
              }}
            >
              {reason}
            </button>
          </li>
        ))}
      </ul>
      <div className="message-feedback-other">
        <textarea
          value={otherText}
          onChange={(event) => setOtherText(event.target.value)}
          placeholder="Describe the issue (optional)"
          rows={2}
          aria-label="Other feedback details"
        />
        <button type="button" disabled={!otherText.trim()} onClick={submitOther}>
          Submit
        </button>
      </div>
    </div>
  );
}
