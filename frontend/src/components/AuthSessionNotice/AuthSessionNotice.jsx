import { useEffect, useState } from 'react';
import { SESSION_UPDATED_EVENT } from '../../lib/session.js';
import { AUTH_SESSION_NOTICE_STORAGE_KEY, clearAuthSessionNotice } from './authSessionNoticeHelpers.js';
import './AuthSessionNotice.css';

export default function AuthSessionNotice() {
  const [message, setMessage] = useState('');

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(AUTH_SESSION_NOTICE_STORAGE_KEY);
      if (stored) {
        setMessage(stored);
        sessionStorage.removeItem(AUTH_SESSION_NOTICE_STORAGE_KEY);
      }
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    const onSessionUpdated = (event) => {
      if (event.detail?.user?.email) {
        clearAuthSessionNotice();
        setMessage('');
      }
    };
    const onCleared = () => setMessage('');
    globalThis.addEventListener(SESSION_UPDATED_EVENT, onSessionUpdated);
    globalThis.addEventListener('allmodelai:auth-notice-cleared', onCleared);
    return () => {
      globalThis.removeEventListener(SESSION_UPDATED_EVENT, onSessionUpdated);
      globalThis.removeEventListener('allmodelai:auth-notice-cleared', onCleared);
    };
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
