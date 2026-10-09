import { useEffect, useState } from 'react';
import './AuthSessionNotice.css';

const STORAGE_KEY = 'allmodelai_auth_notice';

export default function AuthSessionNotice() {
  const [message, setMessage] = useState('');

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        setMessage(stored);
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      /* private mode */
    }
  }, []);

  if (!message) return null;

  return (
    <div className="auth-session-notice" role="alert">
      <p>{message}</p>
      <button type="button" className="auth-session-notice-dismiss" onClick={() => setMessage('')} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
