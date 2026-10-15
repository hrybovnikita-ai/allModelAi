import { useCallback, useEffect, useMemo, useState } from 'react';
import ConfirmDialog from '../ConfirmDialog/ConfirmDialog';
import {
  clearAllUserMemories,
  createUserMemory,
  deleteUserMemory,
  fetchMemorySettings,
  fetchUserMemories,
  searchUserMemories,
  updateMemorySettings,
  updateUserMemory,
} from '../../lib/aiImprovement';

export default function UserMemorySettings() {
  const [settings, setSettings] = useState(null);
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState('');
  const [clearOpen, setClearOpen] = useState(false);
  const [clearLoading, setClearLoading] = useState(false);
  const [clearError, setClearError] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

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
      setSearchResults(null);
    } catch (loadError) {
      setError(loadError.message || 'Could not load AI memory.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const displayedItems = useMemo(
    () => (searchResults ? searchResults : items),
    [items, searchResults],
  );

  const patchSettings = async (patch) => {
    setError('');
    setNotice('');
    setBusyAction('settings');
    try {
      const next = await updateMemorySettings(patch);
      setSettings(next);
      setNotice(
        next.memoryEnabled
          ? 'AI memory enabled. New facts you save stay private to your account.'
          : 'AI memory disabled. Existing memories remain until you delete them; chat is unchanged.',
      );
    } catch (patchError) {
      setError(patchError.message || 'Could not save settings.');
    } finally {
      setBusyAction('');
    }
  };

  const addMemory = async (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setError('');
    setNotice('');
    setBusyAction('create');
    try {
      await createUserMemory(text);
      setDraft('');
      setNotice('Memory saved.');
      await reload();
    } catch (saveError) {
      setError(saveError.message || 'Could not save memory.');
    } finally {
      setBusyAction('');
    }
  };

  const runSearch = async (event) => {
    event.preventDefault();
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults(null);
      setNotice('');
      return;
    }
    setError('');
    setNotice('');
    setSearchBusy(true);
    try {
      const result = await searchUserMemories(q, { limit: 40 });
      setSearchResults(result.items);
      setNotice(
        result.items.length
          ? `Found ${result.items.length} matching memor${result.items.length === 1 ? 'y' : 'ies'}.`
          : 'No memories matched your search.',
      );
    } catch (searchError) {
      setError(searchError.message || 'Could not search memories.');
    } finally {
      setSearchBusy(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
    setNotice('');
  };

  const saveEdit = async (id) => {
    const text = editText.trim();
    if (!text) return;
    setError('');
    setBusyAction(`edit:${id}`);
    try {
      await updateUserMemory(id, text);
      setEditingId(null);
      setEditText('');
      setNotice('Memory updated.');
      await reload();
    } catch (editError) {
      setError(editError.message || 'Could not update memory.');
    } finally {
      setBusyAction('');
    }
  };

  const confirmDeleteOne = async () => {
    if (!pendingDeleteId || deleteLoading) return;
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await deleteUserMemory(pendingDeleteId);
      setPendingDeleteId(null);
      setNotice('Memory deleted.');
      await reload();
    } catch (err) {
      setDeleteError(err.message || 'Could not delete memory.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const confirmClearAll = async () => {
    if (clearLoading) return;
    setClearLoading(true);
    setClearError('');
    try {
      await clearAllUserMemories();
      setClearOpen(false);
      setNotice('All memories cleared.');
      await reload();
    } catch (err) {
      setClearError(err.message || 'Could not clear memories.');
    } finally {
      setClearLoading(false);
    }
  };

  if (loading && !settings) {
    return (
      <section className="settings-panel" id="ai-memory" aria-busy="true">
        <h2>AI memory</h2>
        <p className="settings-note">Loading AI memory…</p>
      </section>
    );
  }

  const memoryEnabled = Boolean(settings?.memoryEnabled);
  const showEmpty = !loading && displayedItems.length === 0;

  return (
    <section className="settings-panel" id="ai-memory" aria-busy={loading || Boolean(busyAction)}>
      <h2>AI memory</h2>
      <p className="settings-note">
        Opt-in memory stores facts you explicitly save. It is off by default, does not train model weights,
        and stays private to your signed-in account. Chat responses do not use vector memory until you approve injection separately.
      </p>

      {error ? <p className="settings-error" role="alert">{error}</p> : null}
      {notice ? <p className="settings-success" role="status">{notice}</p> : null}

      <label className="settings-toggle">
        <span>Enable AI memory</span>
        <input
          type="checkbox"
          checked={memoryEnabled}
          disabled={busyAction === 'settings'}
          onChange={(event) => patchSettings({ memoryEnabled: event.target.checked })}
          aria-describedby="ai-memory-opt-in-hint"
        />
      </label>
      <p id="ai-memory-opt-in-hint" className="settings-note memory-opt-in-hint">
        {memoryEnabled
          ? 'Memory is on. You can save, search, edit, and delete your own memories.'
          : 'Memory is off. Existing memories stay listed for review and deletion; new saves stay blocked.'}
      </p>

      <label className="settings-toggle">
        <span>Share detailed feedback with AllModelAI (ratings &amp; corrections for routing quality)</span>
        <input
          type="checkbox"
          checked={settings?.shareFeedback !== false}
          disabled={busyAction === 'settings'}
          onChange={(event) => patchSettings({ shareFeedback: event.target.checked })}
        />
      </label>
      <label className="settings-toggle">
        <span>Exclude temporary chats from memory context</span>
        <input
          type="checkbox"
          checked={settings?.excludeTemporaryFromMemory !== false}
          disabled={busyAction === 'settings'}
          onChange={(event) => patchSettings({ excludeTemporaryFromMemory: event.target.checked })}
        />
      </label>

      <form className="settings-inline-form" onSubmit={addMemory}>
        <label className="memory-field-label" htmlFor="ai-memory-draft">
          Save a memory
        </label>
        <textarea
          id="ai-memory-draft"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Example: I prefer concise answers in Ukrainian for work topics."
          rows={3}
          disabled={!memoryEnabled || busyAction === 'create'}
        />
        <button type="submit" disabled={!memoryEnabled || !draft.trim() || busyAction === 'create'}>
          {busyAction === 'create' ? 'Saving…' : 'Save memory'}
        </button>
      </form>

      <form className="memory-search-form" onSubmit={runSearch}>
        <label className="memory-field-label" htmlFor="ai-memory-search">
          Search your memories
        </label>
        <div className="memory-search-row">
          <input
            id="ai-memory-search"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by keyword…"
            enterKeyHint="search"
            disabled={searchBusy}
          />
          <button type="submit" disabled={searchBusy || !searchQuery.trim()}>
            {searchBusy ? 'Searching…' : 'Search'}
          </button>
          {searchResults ? (
            <button type="button" className="memory-search-clear" onClick={clearSearch}>
              Clear
            </button>
          ) : null}
        </div>
      </form>

      {loading ? <p className="settings-note">Refreshing memories…</p> : null}

      {showEmpty ? (
        <p className="settings-note memory-empty" role="status">
          {searchResults
            ? 'No matching memories.'
            : memoryEnabled
              ? 'No saved memories yet. Add one above to get started.'
              : 'No saved memories. Enable AI memory to start saving facts.'}
        </p>
      ) : (
        <ul className="memory-list" aria-label="Your AI memories">
          {displayedItems.map((item) => (
            <li key={item.id}>
              {editingId === item.id ? (
                <>
                  <textarea
                    value={editText}
                    onChange={(event) => setEditText(event.target.value)}
                    rows={2}
                    disabled={busyAction === `edit:${item.id}`}
                  />
                  <div className="memory-list-actions">
                    <button
                      type="button"
                      onClick={() => saveEdit(item.id)}
                      disabled={!editText.trim() || busyAction === `edit:${item.id}`}
                    >
                      {busyAction === `edit:${item.id}` ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      className="modal-cancel"
                      onClick={() => setEditingId(null)}
                      disabled={busyAction === `edit:${item.id}`}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p>{item.contentPreview}</p>
                  {item.updatedAt ? (
                    <time className="memory-meta" dateTime={item.updatedAt}>
                      Updated {new Date(item.updatedAt).toLocaleString()}
                    </time>
                  ) : null}
                  <div className="memory-list-actions">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(item.id);
                        setEditText(String(item.contentPreview || '').replace(/…$/, ''));
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError('');
                        setPendingDeleteId(item.id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && !searchResults ? (
        <button
          type="button"
          className="settings-danger"
          onClick={() => {
            setClearError('');
            setClearOpen(true);
          }}
        >
          Clear all memories
        </button>
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingDeleteId)}
        title="Delete memory?"
        description="This permanently deletes this memory from your account. This action cannot be undone."
        confirmLabel="Delete memory"
        cancelLabel="Cancel"
        destructive
        loading={deleteLoading}
        error={deleteError}
        onConfirm={() => {
          void confirmDeleteOne();
        }}
        onCancel={() => {
          if (deleteLoading) return;
          setPendingDeleteId(null);
          setDeleteError('');
        }}
      />

      <ConfirmDialog
        open={clearOpen}
        title="Clear all memories?"
        description="This permanently deletes every AI memory saved to your account. This action cannot be undone."
        confirmLabel="Clear all"
        cancelLabel="Cancel"
        destructive
        loading={clearLoading}
        error={clearError}
        onConfirm={() => {
          void confirmClearAll();
        }}
        onCancel={() => {
          if (clearLoading) return;
          setClearOpen(false);
          setClearError('');
        }}
      />
    </section>
  );
}
