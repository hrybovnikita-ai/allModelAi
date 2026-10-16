import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { dashboardModels } from '../../data/dashboardModels';
import { resolveModelOnlineStatus } from '../../data/ollamaCloudVariants';
import './ChatAiWorkspace.css';

function WorkspaceCard({ title, description, onClick, disabled = false, children, busy = false }) {
  return (
    <button
      type="button"
      className={`ai-workspace-card${busy ? ' is-busy' : ''}`}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      <span className="ai-workspace-card__title">{title}</span>
      {description ? <span className="ai-workspace-card__desc">{description}</span> : null}
      {children}
    </button>
  );
}

function formatRelativeTime(iso, t) {
  const ms = Date.parse(String(iso || ''));
  if (!Number.isFinite(ms)) return '';
  const delta = Date.now() - ms;
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return t('Just now') || 'Just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/**
 * Compact secondary welcome section — Continue Working, Analyze a File,
 * AI Model Status, Improve My Prompt. Uses real user/API data only.
 */
export default function ChatAiWorkspace({
  t,
  chatHistory = [],
  projects = [],
  activeProject = null,
  modelStatus = {},
  prompt = '',
  onOpenConversation,
  onEnterProject,
  onAnalyzeFile,
  onAcceptImprovedPrompt,
  selectedSlug = 'gpt',
}) {
  const [improveBusy, setImproveBusy] = useState(false);
  const [improveError, setImproveError] = useState('');
  const [improvedDraft, setImprovedDraft] = useState('');
  const [statusLoading, setStatusLoading] = useState(() => !Object.keys(modelStatus || {}).length);

  useEffect(() => {
    if (Object.keys(modelStatus || {}).length) setStatusLoading(false);
  }, [modelStatus]);

  const recentChat = useMemo(() => {
    const list = Array.isArray(chatHistory) ? chatHistory : [];
    return list.find((item) => item && !item.isTemporary && !item.temporary) || null;
  }, [chatHistory]);

  const recentProject = activeProject || (Array.isArray(projects) && projects[0]) || null;

  const statusRows = useMemo(() => {
    const priority = ['gpt', 'claude', 'gemini', 'grok', 'deepseek', 'ollama', 'mistral', 'qwen'];
    const rows = priority.map((slug) => {
      const model = dashboardModels.find((item) => item.slug === slug);
      if (!model) return null;
      const known = Object.prototype.hasOwnProperty.call(modelStatus || {}, slug);
      const online = resolveModelOnlineStatus(slug, modelStatus || {});
      let state;
      let labelKey;
      if (statusLoading && !known) {
        state = 'Loading';
        labelKey = 'Checking…';
      } else if (online) {
        state = 'Available';
        labelKey = 'Available';
      } else if (known && modelStatus[slug] === false) {
        state = 'Unavailable';
        labelKey = 'API needed';
      } else {
        state = 'Configured';
        labelKey = 'Configured';
      }
      return {
        slug,
        name: model.name,
        state,
        label: t(labelKey) || labelKey,
      };
    }).filter(Boolean);
    return rows.slice(0, 4);
  }, [modelStatus, statusLoading, t]);

  const continueDescription = (() => {
    if (recentChat) {
      const title = String(recentChat.title || t('Untitled') || 'Untitled').trim() || (t('Untitled') || 'Untitled');
      const when = formatRelativeTime(recentChat.updatedAt || recentChat.updated_at || recentChat.createdAt, t);
      return when ? `${title} · ${when}` : title;
    }
    if (recentProject) {
      return `${t('Project') || 'Project'}: ${recentProject.name}`;
    }
    return t('No recent work yet') || 'No recent work yet';
  })();

  const handleContinue = () => {
    if (recentChat && typeof onOpenConversation === 'function') {
      onOpenConversation(recentChat);
      return;
    }
    if (recentProject && typeof onEnterProject === 'function') {
      onEnterProject(recentProject);
    }
  };

  const handleImprove = async () => {
    const draft = String(prompt || '').trim();
    if (!draft) {
      setImproveError(t('Type a prompt in the composer first') || 'Type a prompt in the composer first');
      setImprovedDraft('');
      return;
    }
    setImproveBusy(true);
    setImproveError('');
    setImprovedDraft('');
    try {
      const response = await apiFetch('/api/chat/improve-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: draft, model: selectedSlug }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || t('Could not improve the prompt') || 'Could not improve the prompt');
      }
      const next = String(data.improvedPrompt || '').trim();
      if (!next) throw new Error(t('Could not improve the prompt') || 'Could not improve the prompt');
      setImprovedDraft(next);
    } catch (error) {
      setImproveError(error.message || t('Could not improve the prompt') || 'Could not improve the prompt');
    } finally {
      setImproveBusy(false);
    }
  };

  return (
    <section className="ai-workspace" aria-labelledby="ai-workspace-heading">
      <header className="ai-workspace-head">
        <h2 id="ai-workspace-heading" className="ai-workspace-title">{t('Your AI Workspace') || 'Your AI Workspace'}</h2>
        <p className="ai-workspace-subtitle">
          {t('Quick access to recent work, files, model status, and prompt tools.')
            || 'Quick access to recent work, files, model status, and prompt tools.'}
        </p>
      </header>

      <div className="ai-workspace-grid">
        <WorkspaceCard
          title={t('Continue Working') || 'Continue Working'}
          description={continueDescription}
          onClick={handleContinue}
          disabled={!recentChat && !recentProject}
        />

        <WorkspaceCard
          title={t('Analyze a File') || 'Analyze a File'}
          description={t('Upload a document or screenshot to discuss') || 'Upload a document or screenshot to discuss'}
          onClick={() => onAnalyzeFile?.()}
        />

        <div className="ai-workspace-card ai-workspace-card--static" role="status" aria-live="polite">
          <span className="ai-workspace-card__title">{t('AI Model Status') || 'AI Model Status'}</span>
          <span className="ai-workspace-card__desc">
            {statusLoading
              ? (t('Checking provider availability…') || 'Checking provider availability…')
              : (t('Live availability from your configured providers') || 'Live availability from your configured providers')}
          </span>
          <ul className="ai-workspace-status-list">
            {statusRows.map((row) => (
              <li key={row.slug} className={`ai-workspace-status-row is-${row.state.toLowerCase()}`}>
                <span>{row.name}</span>
                <span>{row.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="ai-workspace-card ai-workspace-card--static ai-workspace-improve">
          <span className="ai-workspace-card__title">{t('Improve My Prompt') || 'Improve My Prompt'}</span>
          <span className="ai-workspace-card__desc">
            {t('Clarify your draft without replacing it until you accept')
              || 'Clarify your draft without replacing it until you accept'}
          </span>
          <div className="ai-workspace-improve-actions">
            <button
              type="button"
              className="ai-workspace-action-btn"
              onClick={handleImprove}
              disabled={improveBusy}
            >
              {improveBusy
                ? (t('Improving…') || 'Improving…')
                : (t('Improve My Prompt') || 'Improve My Prompt')}
            </button>
          </div>
          {improveError ? <p className="ai-workspace-improve-error" role="alert">{improveError}</p> : null}
          {improvedDraft ? (
            <div className="ai-workspace-improve-preview">
              <p className="ai-workspace-improve-text">{improvedDraft}</p>
              <div className="ai-workspace-improve-actions">
                <button
                  type="button"
                  className="ai-workspace-action-btn is-primary"
                  onClick={() => {
                    onAcceptImprovedPrompt?.(improvedDraft);
                    setImprovedDraft('');
                    setImproveError('');
                  }}
                >
                  {t('Accept') || 'Accept'}
                </button>
                <button
                  type="button"
                  className="ai-workspace-action-btn"
                  onClick={() => {
                    setImprovedDraft('');
                    setImproveError('');
                  }}
                >
                  {t('Reject') || 'Reject'}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
