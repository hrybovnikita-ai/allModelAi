import { useMemo, useState } from 'react';
import { useSession } from '../Session/SessionProvider.jsx';
import {
  collectAuthDiagnostics,
  formatAuthDiagnosticsReport,
  isAuthDebugPanelEnabled,
} from '../../lib/authDebugPanel.js';
import './SocialAuth.css';

export default function AuthDebugPanel() {
  const { status, user } = useSession();
  const [copied, setCopied] = useState(false);
  const enabled = isAuthDebugPanelEnabled();

  const report = useMemo(() => {
    if (!enabled) return '';
    const serverSessionVerified = user?.email && status === 'authenticated' ? 'YES' : status === 'anonymous' ? 'NO' : 'UNKNOWN';
    return formatAuthDiagnosticsReport(
      collectAuthDiagnostics({ status, user, serverSessionVerified }),
    );
  }, [enabled, status, user]);

  if (!enabled) return null;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <aside className="auth-debug-panel" aria-label="Authentication diagnostics">
      <p className="social-auth-eyebrow">Auth debug</p>
      <pre className="auth-debug-pre">{report}</pre>
      <button type="button" className="auth-debug-copy" onClick={onCopy}>
        {copied ? 'Copied' : 'Copy diagnostics'}
      </button>
    </aside>
  );
}
