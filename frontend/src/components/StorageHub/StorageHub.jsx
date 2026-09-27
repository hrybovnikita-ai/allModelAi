import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useOutletContext } from 'react-router-dom';
import { AllModelAILogoMark } from '../AllModelAILogo/AllModelAILogo';
import {
  createStorageIdea,
  deleteStorageIdea,
  fetchStorageIdea,
  fetchStorageOverview,
  withEnglishStorageLabels,
} from '../../lib/storageIdeas';
import './StorageHub.css';

const defaultSettings = {
  defaultModel: 'smart',
  temperature: 0.7,
  webSearch: false,
  routerMode: 'balanced',
  responseLanguage: 'auto',
};

export default function StorageHub() {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const [ideas, setIdeas] = useState([]);
  const [active, setActive] = useState('chat-history');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [promptForm, setPromptForm] = useState({ title: '', content: '' });
  const [settingsForm, setSettingsForm] = useState(defaultSettings);
  const [builderForm, setBuilderForm] = useState({ kind: 'website', name: '', html: '' });
  const [bookmarkForm, setBookmarkForm] = useState({ modelId: 'smart', label: '' });
  const [attachmentForm, setAttachmentForm] = useState({
    fileName: '',
    content: '',
    conversationId: '',
  });

  const localizedIdeas = useMemo(
    () => ideas.map((item) => withEnglishStorageLabels(item)),
    [ideas]
  );

  const activeMeta = useMemo(
    () => localizedIdeas.find((item) => item.id === active),
    [localizedIdeas, active]
  );

  const reloadItems = useCallback(async (ideaId) => {
    const data = await fetchStorageIdea(ideaId);
    if (ideaId === 'chat-settings') {
      setSettingsForm({ ...defaultSettings, ...data });
      setItems([]);
    } else {
      setItems(Array.isArray(data) ? data : []);
    }
  }, []);

  useEffect(() => {
    if (!user?.email) return undefined;
    let cancelled = false;
    Promise.all([fetchStorageOverview(), fetchStorageIdea(active)])
      .then(([overview, data]) => {
        if (cancelled) return;
        setIdeas(overview.ideas || []);
        if (active === 'chat-settings') {
          setSettingsForm({ ...defaultSettings, ...data });
          setItems([]);
        } else {
          setItems(Array.isArray(data) ? data : []);
        }
        setError('');
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.email, active]);

  const switchTab = (id) => {
    setActive(id);
    setLoading(true);
  };

  const runDelete = async (id) => {
    try {
      await deleteStorageIdea(active, id);
      await reloadItems(active);
      const overview = await fetchStorageOverview();
      setIdeas(overview.ideas || []);
    } catch (err) {
      setError(err.message);
    }
  };

  const savePrompt = async (event) => {
    event.preventDefault();
    try {
      await createStorageIdea('favorite-prompts', promptForm);
      setPromptForm({ title: '', content: '' });
      await reloadItems('favorite-prompts');
      const overview = await fetchStorageOverview();
      setIdeas(overview.ideas || []);
    } catch (err) {
      setError(err.message);
    }
  };

  const saveSettings = async (event) => {
    event.preventDefault();
    try {
      await createStorageIdea('chat-settings', settingsForm);
      const overview = await fetchStorageOverview();
      setIdeas(overview.ideas || []);
    } catch (err) {
      setError(err.message);
    }
  };

  const saveBuilder = async (event) => {
    event.preventDefault();
    try {
      await createStorageIdea('builder-projects', builderForm);
      setBuilderForm({ kind: 'website', name: '', html: '' });
      await reloadItems('builder-projects');
      const overview = await fetchStorageOverview();
      setIdeas(overview.ideas || []);
    } catch (err) {
      setError(err.message);
    }
  };

  const saveBookmark = async (event) => {
    event.preventDefault();
    try {
      await createStorageIdea('model-bookmarks', bookmarkForm);
      setBookmarkForm({ modelId: bookmarkForm.modelId, label: '' });
      await reloadItems('model-bookmarks');
      const overview = await fetchStorageOverview();
      setIdeas(overview.ideas || []);
    } catch (err) {
      setError(err.message);
    }
  };

  const saveAttachment = async (event) => {
    event.preventDefault();
    try {
      await createStorageIdea('attachments', {
        ...attachmentForm,
        conversationId: attachmentForm.conversationId || undefined,
      });
      setAttachmentForm({ fileName: '', content: '', conversationId: '' });
      await reloadItems('attachments');
      const overview = await fetchStorageOverview();
      setIdeas(overview.ideas || []);
    } catch (err) {
      setError(err.message);
    }
  };

  const importBrowserFavorites = () => {
    try {
      const raw = localStorage.getItem('allmodelai_favorites');
      const favorites = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(favorites) || !favorites.length) {
        setError('No starred messages found in the browser to import.');
        return;
      }
      Promise.all(
        favorites.slice(0, 10).map((item, index) =>
          createStorageIdea('favorite-prompts', {
            title: `Import ${index + 1}`,
            content: String(item.text || '').slice(0, 4000),
          })
        )
      )
        .then(async () => {
          setActive('favorite-prompts');
          await reloadItems('favorite-prompts');
          const overview = await fetchStorageOverview();
          setIdeas(overview.ideas || []);
        })
        .catch((err) => setError(err.message));
    } catch {
      setError('Could not read localStorage.');
    }
  };

  if (!user) return <Navigate to="/login" replace />;

  return (
    <main className="storage-hub-page" lang="en">
      <header className="storage-hub-header">
        <Link to="/dashboard" className="storage-hub-brand">
          <AllModelAILogoMark />
          AllModelAI
        </Link>
        <nav>
          <Link to="/chat">Chat</Link>
          <Link to="/prompts">Prompts</Link>
          <Link to="/python-ai">Python AI Lab</Link>
        </nav>
      </header>

      <section className="storage-hub-hero">
        <p>STORAGE · 8 IDEAS</p>
        <h1>Storage Hub</h1>
        <span>Eight data types on your account: chats, prompts, settings, projects, usage, bookmarks, attachments, and training.</span>
      </section>

      {error && <p className="storage-hub-error" role="alert">{error}</p>}

      <div className="storage-hub-layout">
        <aside className="storage-hub-tabs" aria-label="Storage categories">
          {localizedIdeas.map((idea) => (
            <button
              type="button"
              key={idea.id}
              className={active === idea.id ? 'active' : ''}
              onClick={() => switchTab(idea.id)}
            >
              <div>
                <strong>{idea.title}</strong>
                <small>{idea.description}</small>
              </div>
              <b>{idea.count ?? 0}</b>
            </button>
          ))}
        </aside>

        <section className="storage-hub-panel">
          <h2>{activeMeta?.title || 'Storage'}</h2>
          <p>{activeMeta?.description}</p>

          {loading && <p className="storage-hub-empty">Loading…</p>}

          {!loading && active === 'favorite-prompts' && (
            <>
              <div className="storage-hub-actions">
                <button type="button" className="secondary" onClick={importBrowserFavorites}>
                  Import from browser
                </button>
              </div>
              <form className="storage-hub-form" onSubmit={savePrompt}>
                <label>
                  Title
                  <input value={promptForm.title} onChange={(e) => setPromptForm({ ...promptForm, title: e.target.value })} placeholder="My prompt" />
                </label>
                <label>
                  Text
                  <textarea rows={4} value={promptForm.content} onChange={(e) => setPromptForm({ ...promptForm, content: e.target.value })} placeholder="Paste your prompt…" required />
                </label>
                <button type="submit">Save prompt</button>
              </form>
            </>
          )}

          {!loading && active === 'chat-settings' && (
            <form className="storage-hub-form" onSubmit={saveSettings}>
              <label>
                Default model
                <input value={settingsForm.defaultModel} onChange={(e) => setSettingsForm({ ...settingsForm, defaultModel: e.target.value })} />
              </label>
              <label>
                Temperature
                <input type="number" min="0" max="2" step="0.1" value={settingsForm.temperature} onChange={(e) => setSettingsForm({ ...settingsForm, temperature: Number(e.target.value) })} />
              </label>
              <label>
                Router mode
                <select value={settingsForm.routerMode} onChange={(e) => setSettingsForm({ ...settingsForm, routerMode: e.target.value })}>
                  <option value="economy">economy</option>
                  <option value="balanced">balanced</option>
                  <option value="quality">quality</option>
                </select>
              </label>
              <label>
                <input type="checkbox" checked={settingsForm.webSearch} onChange={(e) => setSettingsForm({ ...settingsForm, webSearch: e.target.checked })} />
                {' '}Web search by default
              </label>
              <button type="submit">Save to account</button>
            </form>
          )}

          {!loading && active === 'builder-projects' && (
            <form className="storage-hub-form" onSubmit={saveBuilder}>
              <label>
                Type
                <select value={builderForm.kind} onChange={(e) => setBuilderForm({ ...builderForm, kind: e.target.value })}>
                  <option value="website">website</option>
                  <option value="app">app</option>
                </select>
              </label>
              <label>
                Name
                <input value={builderForm.name} onChange={(e) => setBuilderForm({ ...builderForm, name: e.target.value })} required />
              </label>
              <label>
                HTML / description
                <textarea rows={4} value={builderForm.html} onChange={(e) => setBuilderForm({ ...builderForm, html: e.target.value })} />
              </label>
              <button type="submit">Save project</button>
            </form>
          )}

          {!loading && active === 'model-bookmarks' && (
            <form className="storage-hub-form" onSubmit={saveBookmark}>
              <label>
                Model ID
                <input value={bookmarkForm.modelId} onChange={(e) => setBookmarkForm({ ...bookmarkForm, modelId: e.target.value })} required />
              </label>
              <label>
                Label
                <input value={bookmarkForm.label} onChange={(e) => setBookmarkForm({ ...bookmarkForm, label: e.target.value })} placeholder="Smart router" />
              </label>
              <button type="submit">Add bookmark</button>
            </form>
          )}

          {!loading && active === 'attachments' && (
            <form className="storage-hub-form" onSubmit={saveAttachment}>
              <label>
                File name
                <input value={attachmentForm.fileName} onChange={(e) => setAttachmentForm({ ...attachmentForm, fileName: e.target.value })} required />
              </label>
              <label>
                Conversation ID (optional)
                <input value={attachmentForm.conversationId} onChange={(e) => setAttachmentForm({ ...attachmentForm, conversationId: e.target.value })} />
              </label>
              <label>
                Content
                <textarea rows={4} value={attachmentForm.content} onChange={(e) => setAttachmentForm({ ...attachmentForm, content: e.target.value })} required />
              </label>
              <button type="submit">Save attachment</button>
            </form>
          )}

          {!loading && active === 'usage-daily' && (
            <p className="storage-hub-empty">Data is collected automatically on every AI request.</p>
          )}

          {!loading && active === 'training-runs' && (
            <p className="storage-hub-empty">Runs appear after training in Python AI Lab.</p>
          )}

          {!loading && active !== 'chat-settings' && (
            <div className="storage-hub-list">
              {!items.length && active !== 'favorite-prompts' && active !== 'builder-projects' && active !== 'model-bookmarks' && active !== 'attachments' && (
                <p className="storage-hub-empty">Nothing here yet.</p>
              )}
              {items.map((row) => {
                const key = row.id || row.modelId || row.day;
                const title =
                  row.title ||
                  row.name ||
                  row.modelId ||
                  row.fileName ||
                  row.day ||
                  row.id;
                const detail =
                  row.content?.slice?.(0, 160) ||
                  row.preview ||
                  (row.requests != null ? `${row.requests} requests · ${row.tokens || 0} tokens` : '') ||
                  row.model ||
                  JSON.stringify(row.metrics || row.config || '').slice(0, 120);
                const deleteId = row.id || row.modelId;
                const canOpenChat = active === 'chat-history' && row.id;
                const canUsePrompt = active === 'favorite-prompts' && row.content;

                return (
                  <article className="storage-hub-row" key={key}>
                    <div>
                      <strong>{title}</strong>
                      <span>{detail}</span>
                    </div>
                    <div>
                      {canOpenChat && (
                        <button type="button" className="secondary" onClick={() => navigate(`/chat?conversation=${row.id}`)}>
                          Open
                        </button>
                      )}
                      {canUsePrompt && (
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => navigate('/chat', { state: { starterPrompt: row.content } })}
                        >
                          Use in chat
                        </button>
                      )}
                      {deleteId && active !== 'usage-daily' && (
                        <button type="button" className="secondary" onClick={() => runDelete(deleteId)}>
                          Delete
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
