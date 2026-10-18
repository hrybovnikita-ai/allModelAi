import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api';

const DEFAULT_PRIVACY = {
  temporary: true,
  autoDelete: '24 hours',
  memory: false,
};

function readPrivacy() {
  try {
    return { ...DEFAULT_PRIVACY, ...JSON.parse(localStorage.getItem('allmodelai_privacy') || '{}') };
  } catch {
    return { ...DEFAULT_PRIVACY };
  }
}

export default function SettingsPrivacyPanel() {
  const [privacy, setPrivacy] = useState(readPrivacy);
  const [exportNotice, setExportNotice] = useState('');
  const [exportError, setExportError] = useState('');

  const persist = (next) => {
    setPrivacy(next);
    localStorage.setItem('allmodelai_privacy', JSON.stringify(next));
  };

  const exportData = async () => {
    setExportNotice('');
    setExportError('');
    try {
      const response = await apiFetch('/api/privacy/export');
      if (!response.ok) {
        throw new Error('Could not export account data.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `allmodelai-export-${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setExportNotice('Export downloaded for your account.');
    } catch (error) {
      setExportError(error.message || 'Could not export account data.');
    }
  };

  return (
    <section id="settings-privacy" className="settings-card">
      <div>
        <span>Privacy</span>
        <h2>Conversation & data</h2>
        <p className="settings-security-hint">
          Control temporary chats and download your own workspace data.
        </p>
      </div>
      <div className="settings-fields">
        <label className="settings-checkbox-row">
          <input
            type="checkbox"
            checked={Boolean(privacy.temporary)}
            onChange={(event) => persist({ ...privacy, temporary: event.target.checked })}
          />
          Prefer temporary chats when available
        </label>
        <label className="settings-checkbox-row">
          <input
            type="checkbox"
            checked={Boolean(privacy.memory)}
            onChange={(event) => persist({ ...privacy, memory: event.target.checked })}
          />
          Limit AI memory features
        </label>
        <label>
          Auto-delete temporary history
          <select
            value={privacy.autoDelete || '24 hours'}
            onChange={(event) => persist({ ...privacy, autoDelete: event.target.value })}
          >
            <option>1 hour</option>
            <option>24 hours</option>
            <option>7 days</option>
          </select>
        </label>
        <div className="settings-password-actions">
          <button type="button" className="settings-save" onClick={() => { void exportData(); }}>
            Export my data
          </button>
          <Link className="settings-security-link" to="/ai-memory">AI memory</Link>
          <Link className="settings-security-link" to="/privacy">Privacy policy</Link>
        </div>
        {exportNotice ? <p className="settings-password-success" role="status">{exportNotice}</p> : null}
        {exportError ? <p className="settings-password-error" role="alert">{exportError}</p> : null}
      </div>
    </section>
  );
}
