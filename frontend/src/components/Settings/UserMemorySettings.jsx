import { useCallback, useEffect, useState } from 'react';
import {
  clearAllUserMemories,
  createUserMemory,
  deleteUserMemory,
  fetchMemorySettings,
  fetchUserMemories,
  updateMemorySettings,
  updateUserMemory,
} from '../../lib/aiImprovement';

export default function UserMemorySettings() {
  const [settings, setSettings] = useState(null);
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextSettings, nextItems] = await Promise.all([
        fetchMemorySettings(),
        fetchUserMemories(),
      ]);
      setSettings(nextSettings);
      setItems(nextItems);
    } catch (loadError) {
      setError(loadError.message || 'Could not load AI memory.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const patchSettings = async (patch) => {
    setError('');
    try {
      const next = await updateMemorySettings(patch);
      setSettings(next);
      setNotice('Settings saved.');
    } catch (patchError) {
      setError(patchError.message || 'Could not save settings.');
    }
  };

  const addMemory = async (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setError('');
    try {
      await createUserMemory(text);
      setDraft('');
      setNotice('Memory saved.');
      await reload();
    } catch (saveError) {
      setError(saveError.message || 'Could not save memory.');
    }
  };

  const saveEdit = async (id) => {
    const text = editText.trim();
    if (!text) return;
    try {
      await updateUserMemory(id, text);
      setEditingId(null);
      setEditText('');
      await reload();
    } catch (editError) {
      setError(editError.message || 'Could not update memory.');
    }
  };

  if (loading && !settings) {
    return <p className="settings-note">Loading AI memory…</p>;
  }

  return (
    <section className="settings-panel" id="ai-memory">
      <h2>AI memory</h2>
      <p className="settings-note">
        Opt-in memory stores facts you explicitly save. It does not train model weights and stays private to your account.
      </p>
      {error && <p className="settings-error">{error}</p>}
      {notice && <p className="settings-success">{notice}</p>}
      <label className="settings-toggle">
        <span>Enable AI memory</span>
        <input
          type="checkbox"
          checked={Boolean(settings?.memoryEnabled)}
          onChange={(event) => patchSettings({ memoryEnabled: event.target.checked })}
        />
      </label>
      <label className="settings-toggle">
        <span>Share detailed feedback with AllModelAI (ratings &amp; corrections for routing quality)</span>
        <input
          type="checkbox"
          checked={settings?.shareFeedback !== false}
          onChange={(event) => patchSettings({ shareFeedback: event.target.checked })}
        />
      </label>
      <label className="settings-toggle">
        <span>Exclude temporary chats from memory context</span>
        <input
          type="checkbox"
          checked={settings?.excludeTemporaryFromMemory !== false}
          onChange={(event) => patchSettings({ excludeTemporaryFromMemory: event.target.checked })}
        />
      </label>

      <form className="settings-inline-form" onSubmit={addMemory}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Example: I prefer concise answers in Ukrainian for work topics."
          rows={3}
          disabled={!settings?.memoryEnabled}
        />
        <button type="submit" disabled={!settings?.memoryEnabled || !draft.trim()}>Save memory</button>
      </form>

      <ul className="memory-list">
        {items.map((item) => (
          <li key={item.id}>
            {editingId === item.id ? (
              <>
                <textarea value={editText} onChange={(event) => setEditText(event.target.value)} rows={2} />
                <div className="memory-list-actions">
                  <button type="button" onClick={() => saveEdit(item.id)}>Save</button>
                  <button type="button" className="modal-cancel" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <p>{item.contentPreview}</p>
                <div className="memory-list-actions">
                  <button type="button" onClick={() => { setEditingId(item.id); setEditText(item.contentPreview.replace(/…$/, '')); }}>Edit</button>
                  <button type="button" onClick={() => deleteUserMemory(item.id).then(reload).catch((e) => setError(e.message))}>Delete</button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      {items.length > 0 && (
        <button type="button" className="settings-danger" onClick={() => clearAllUserMemories().then(reload).catch((e) => setError(e.message))}>
          Clear all memories
        </button>
      )}
    </section>
  );
}
