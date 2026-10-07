import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { AllModelAILogoMark } from '../AllModelAILogo/AllModelAILogo';
import { ProjectIconBadge } from './CreateProjectModal';
import SidebarIconButton from './SidebarIconButton';
import {
  conversationDisplayTitle,
  formatConversationTime,
  conversationSecondaryLabel,
  getConversationTimestamp,
  groupConversationsByDate,
} from '../../lib/chatSidebarHistory';
import {
  IconSearch,
  IconSidebarChevron,
  IconSidebarClock,
  IconSidebarFolder,
  IconSidebarPlus,
  IconSidebarSettings,
  IconSidebarSpark,
  IconToolArena,
  IconToolBackup,
  IconToolExport,
  IconToolImage,
  IconToolInstructions,
  IconToolProject,
  IconToolPrompt,
  IconToolSmart,
  IconToolTemporary,
  IconToolTraining,
  IconToolKnowledgeBase,
} from './ChatSidebarIcons';
import './ChatSidebar.css';

function readBool(key, fallback = true) {
  try {
    const v = globalThis.localStorage?.getItem(key);
    if (v === null) return fallback;
    return v === 'true';
  } catch {
    return fallback;
  }
}

function writeBool(key, value) {
  try {
    globalThis.localStorage?.setItem(key, String(value));
  } catch { /* ignore */ }
}

function SidebarSection({ id, title, open, onToggle, children }) {
  return (
    <section className="sidebar-section" data-section={id}>
      <button type="button" className="sidebar-section-toggle" onClick={onToggle} aria-expanded={open}>
        <span className="sidebar-section-label">{title}</span>
        <IconSidebarChevron open={open} />
      </button>
      {open && <div className="sidebar-section-body">{children}</div>}
    </section>
  );
}

function CompactToolRow({
  icon: Icon,
  label,
  hint,
  active = false,
  disabled = false,
  onClick,
  title,
}) {
  return (
    <button
      type="button"
      className={`sidebar-tool-row ${active ? 'is-active' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={hint || label}
      aria-label={label}
    >
      <span className="sidebar-tool-row-icon">{Icon ? <Icon /> : null}</span>
      <span className="sidebar-tool-row-label">{label}</span>
    </button>
  );
}

function ConversationRow({
  conversation,
  active,
  pinned,
  modelName,
  timeLabel,
  title,
  secondaryLabel,
  menuOpen,
  onOpen,
  onMenuToggle,
  onPin,
  onRename,
  onDelete,
  onExport,
  canExport,
  t,
}) {
  return (
    <div className={`sidebar-chat-item ${active ? 'is-active' : ''}`}>
      <button type="button" className="sidebar-chat-open" onClick={onOpen}>
        <span className="sidebar-chat-title">{title}</span>
        <span className="sidebar-chat-meta">
          {pinned && <span className="sidebar-chat-pin" aria-label={t('Pinned')}>★</span>}
          {secondaryLabel && <span className="sidebar-chat-kind">{secondaryLabel}</span>}
          {secondaryLabel && (modelName || timeLabel) && <span aria-hidden="true"> · </span>}
          {modelName && <span>{modelName}</span>}
          {modelName && timeLabel && <span aria-hidden="true"> · </span>}
          {timeLabel && <span>{timeLabel}</span>}
        </span>
      </button>
      <button
        type="button"
        className="sidebar-chat-more"
        aria-expanded={menuOpen}
        aria-label={t('Conversation options')}
        onClick={onMenuToggle}
      >
        •••
      </button>
      {menuOpen && (
        <div className="sidebar-chat-menu" lang="en">
          <button type="button" onClick={onRename}>{t('Rename')}</button>
          <button type="button" onClick={onPin}>{pinned ? t('Unpin') : t('Pin')}</button>
          {canExport && <button type="button" onClick={onExport}>{t('Export')}</button>}
          <button type="button" className="is-danger" onClick={onDelete}>{t('Delete')}</button>
        </div>
      )}
    </div>
  );
}

export default function ChatSidebar({
  t,
  user,
  isSidebarCollapsed,
  sidebarOpen,
  expandSidebar,
  collapseSidebar,
  setSidebarOpen,
  newChat,
  openSmartRouter,
  chooseSkill,
  createProject,
  goTo,
  logger,
  temporaryChat,
  startTemporaryChat,
  selectedSlug,
  messages,
  exportConversation,
  editSystemInstructions,
  backupWorkspace,
  projects,
  activeProject,
  enterProject,
  projectMenuId,
  setProjectMenuId,
  renameProject,
  deleteProject,
  favorites,
  chooseSuggestion,
  dashboardModels,
  chatHistory,
  visibleHistory,
  historyQuery,
  setHistoryQuery,
  chatMeta,
  activeConversationId,
  openConversation,
  chatMenuId,
  setChatMenuId,
  pinConversation,
  renameConversation,
  deleteConversation,
  themePreference,
  textColor,
  chatTextColors,
  setDeleteModalOpen,
}) {
  const [toolsOpen, setToolsOpen] = useState(() => readBool('allmodelai_sidebar_tools_open', true));
  const [projectsOpen, setProjectsOpen] = useState(() => readBool('allmodelai_sidebar_projects_open', true));
  const [exploreOpen, setExploreOpen] = useState(() => readBool('allmodelai_sidebar_explore_open', false));

  const toggleTools = () => {
    setToolsOpen((open) => {
      writeBool('allmodelai_sidebar_tools_open', !open);
      return !open;
    });
  };
  const toggleProjects = () => {
    setProjectsOpen((open) => {
      writeBool('allmodelai_sidebar_projects_open', !open);
      return !open;
    });
  };
  const toggleExplore = () => {
    setExploreOpen((open) => {
      writeBool('allmodelai_sidebar_explore_open', !open);
      return !open;
    });
  };

  const conversationPreview = (conversation) => {
    const firstUserMessage = conversation.messages?.find((message) => message.role === 'user');
    return String(firstUserMessage?.content ?? firstUserMessage?.text ?? 'Saved conversation')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
  };

  const grouped = useMemo(
    () => groupConversationsByDate(visibleHistory, chatMeta),
    [visibleHistory, chatMeta],
  );

  const modelLabel = (slug) => dashboardModels.find((model) => model.slug === slug)?.name || slug || '';

  const renderConversation = (conversation) => {
    const title = conversationDisplayTitle(conversation, conversationPreview);
    const secondaryLabel = conversationSecondaryLabel(conversation);
    const ts = getConversationTimestamp(conversation);
    const timeLabel = formatConversationTime(ts);
    const pinned = Boolean(chatMeta[conversation.id]?.pinned);
    const canExport = activeConversationId === conversation.id && messages.length > 0;

    return (
      <ConversationRow
        key={conversation.id}
        conversation={conversation}
        active={activeConversationId === conversation.id}
        pinned={pinned}
        modelName={modelLabel(conversation.model)}
        timeLabel={timeLabel}
        title={title}
        secondaryLabel={secondaryLabel}
        menuOpen={chatMenuId === conversation.id}
        onOpen={() => openConversation(conversation)}
        onMenuToggle={() => setChatMenuId((id) => (id === conversation.id ? null : conversation.id))}
        onPin={() => pinConversation(conversation)}
        onRename={() => renameConversation(conversation)}
        onDelete={() => deleteConversation(conversation)}
        onExport={exportConversation}
        canExport={canExport}
        t={t}
      />
    );
  };

  return (
    <aside className={`chat-sidebar ${sidebarOpen ? 'open' : ''} ${isSidebarCollapsed ? 'is-collapsed' : ''}`}>
      <div className="sidebar-shell">
        <div className="sidebar-top sidebar-top-compact">
          {isSidebarCollapsed ? (
            <SidebarIconButton className="sidebar-dragon-toggle" label={t('Open sidebar')} onClick={expandSidebar}>
              <AllModelAILogoMark size={38} className="sidebar-dragon-mark" />
            </SidebarIconButton>
          ) : (
            <>
              <Link to="/dashboard" className="chat-brand chat-brand-compact">
                <AllModelAILogoMark />
                <strong>AllModelAI</strong>
              </Link>
              <SidebarIconButton className="sidebar-collapse-toggle" label={t('Close sidebar')} onClick={collapseSidebar}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="16" rx="3" />
                  <path d="M9 4v16" />
                  <path d="M14 10l-3 2 3 2" />
                </svg>
              </SidebarIconButton>
              <button className="sidebar-close" type="button" onClick={() => setSidebarOpen(false)} aria-label={t('Close sidebar')}>×</button>
            </>
          )}
        </div>

        <nav className="sidebar-rail" aria-label={t('Quick navigation')}>
          <SidebarIconButton className="sidebar-rail-btn" label={t('New conversation')} onClick={newChat}>
            <IconSidebarPlus />
          </SidebarIconButton>
          <SidebarIconButton className="sidebar-rail-btn" label={t('Your chats')} onClick={expandSidebar}>
            <IconSidebarClock />
          </SidebarIconButton>
          <SidebarIconButton className="sidebar-rail-btn" label={t('Smart Router')} active={selectedSlug === 'smart'} onClick={openSmartRouter}>
            <IconSidebarSpark />
          </SidebarIconButton>
          <SidebarIconButton className="sidebar-rail-btn" label={t('Projects')} onClick={createProject}>
            <IconSidebarFolder />
          </SidebarIconButton>
          <SidebarIconButton className="sidebar-rail-btn" label={t('Settings')} onClick={() => goTo('/chat/settings', 'Settings')}>
            <IconSidebarSettings />
          </SidebarIconButton>
        </nav>

        <div className="sidebar-expanded-content">
          <div className="sidebar-upper">
            <button type="button" className="new-chat new-chat-compact" onClick={newChat}>
              <IconSidebarPlus />
              <span>{t('New conversation')}</span>
            </button>

            <SidebarSection id="tools" title={t('AI tools')} open={toolsOpen} onToggle={toggleTools}>
              <div className="sidebar-tools-list">
                <CompactToolRow icon={IconToolTemporary} label={t('Temporary chat')} hint={t('Not saved to history')} active={temporaryChat} onClick={startTemporaryChat} />
                <CompactToolRow icon={IconToolProject} label={t('New project')} hint={t('Organize chats by goal')} onClick={createProject} />
                <CompactToolRow icon={IconToolArena} label={t('AI Arena')} hint={t('Compare answers side by side')} onClick={() => goTo('/arena', 'AI Arena')} />
                <CompactToolRow icon={IconToolSmart} label={t('Smart Router')} hint={t('Choose the best AI automatically')} active={selectedSlug === 'smart'} onClick={openSmartRouter} />
                <CompactToolRow icon={IconToolImage} label={t('Generate image')} hint={t('Create an image from text')} onClick={() => chooseSkill('image')} />
                <CompactToolRow icon={IconToolPrompt} label={t('Prompt library')} hint={t('Ready-to-use templates')} onClick={() => goTo('/studio?tool=prompt', 'Prompt library')} />
                <CompactToolRow icon={IconToolExport} label={t('Export chat')} hint={t('Download this conversation')} disabled={!messages.length} onClick={exportConversation} />
                <CompactToolRow icon={IconToolInstructions} label={t('AI instructions')} hint={t('Set language, style, and behavior')} onClick={editSystemInstructions} />
                <CompactToolRow icon={IconToolBackup} label={t('Backup workspace')} hint={t('Download chats and settings')} onClick={backupWorkspace} />
                <CompactToolRow icon={IconToolTraining} label={t('AI model training')} hint={t('Linear layers, loss, backward, PyTorch')} onClick={() => goTo('/ai-training', 'AI Training Lab')} />
                <CompactToolRow icon={IconToolKnowledgeBase} label={t('Knowledge Base')} hint={t('Upload docs and ask grounded questions')} onClick={() => goTo('/knowledge', 'Knowledge Base')} />
                <CompactToolRow icon={IconSidebarSettings} label={t('Chat settings')} hint={t('Change input and message colors')} onClick={() => goTo('/chat/settings', 'Chat settings')} />
              </div>
            </SidebarSection>

            <SidebarSection id="projects" title={t('Projects')} open={projectsOpen} onToggle={toggleProjects}>
                {projects.length === 0 ? (
                  <button type="button" className="sidebar-empty-projects" onClick={createProject}>{t('Create a project')}</button>
                ) : (
                  <div className="sidebar-projects-list">
                    {projects.map((project) => (
                      <div className={`sidebar-project-item ${activeProject?.id === project.id ? 'is-active' : ''}`} key={project.id}>
                        <button type="button" className="sidebar-project-open" onClick={() => enterProject(project)}>
                          <ProjectIconBadge project={project} />
                          <span>{project.name}</span>
                        </button>
                        <button
                          type="button"
                          className="sidebar-project-more"
                          aria-label={`Options for ${project.name}`}
                          onClick={() => setProjectMenuId((id) => (id === project.id ? null : project.id))}
                        >
                          •••
                        </button>
                        {projectMenuId === project.id && (
                          <div className="sidebar-project-menu">
                            <button type="button" onClick={() => renameProject(project)}>{t('Rename')}</button>
                            <button type="button" className="is-danger" onClick={() => deleteProject(project)}>{t('Delete')}</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
            </SidebarSection>

            {favorites.length > 0 && (
              <div className="sidebar-favorites-compact">
                <p className="sidebar-mini-heading">{t('Favorites')}</p>
                {favorites.slice(0, 3).map((favorite) => (
                  <button key={favorite.id} type="button" className="sidebar-favorite-row" onClick={() => chooseSuggestion(favorite.text)} title={favorite.text}>
                    <span>{dashboardModels.find((model) => model.slug === favorite.modelSlug)?.name || 'AI'}</span>
                    <small>{favorite.text}</small>
                  </button>
                ))}
              </div>
            )}
          </div>

          <section
            className="sidebar-chats-panel"
            aria-label={t('Your chats')}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setChatMenuId(null);
                event.target.closest('.sidebar-chat-item')?.querySelector('.sidebar-chat-more')?.focus();
              }
            }}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setChatMenuId(null);
            }}
          >
            <div className="sidebar-chats-head">
              <h2 className="sidebar-chats-title">{t('Your chats')}</h2>
              <span className="sidebar-chats-count">{chatHistory.length}</span>
            </div>
            <label className="sidebar-search">
              <IconSearch />
              <input
                value={historyQuery}
                onChange={(event) => setHistoryQuery(event.target.value)}
                placeholder={t('Search chats...')}
                aria-label={t('Search chats')}
              />
            </label>
            <div className="sidebar-chats-scroll">
              {chatHistory.length === 0 && (
                <p className="sidebar-chats-empty">{t('Your saved chats will appear here.')}</p>
              )}
              {chatHistory.length > 0 && visibleHistory.length === 0 && (
                <p className="sidebar-chats-empty">{t('No matching conversations.')}</p>
              )}

              {grouped.pinned.length > 0 && (
                <div className="sidebar-chat-group">
                  <p className="sidebar-chat-group-label">{t('Pinned')}</p>
                  {grouped.pinned.map(renderConversation)}
                </div>
              )}

              {grouped.groups.map((group) => (
                <div className="sidebar-chat-group" key={group.id}>
                  <p className="sidebar-chat-group-label">{t(group.label)}</p>
                  {group.items.map(renderConversation)}
                </div>
              ))}
            </div>
          </section>

          <div className="sidebar-footer">
            <SidebarSection id="explore" title={t('Explore')} open={exploreOpen} onToggle={toggleExplore}>
              <nav className="sidebar-explore-links" aria-label={t('Chat navigation')}>
                <Link to="/dashboard" onClick={() => logger.action('Open: Dashboard', { path: '/dashboard' })}>{t('Dashboard')}</Link>
                <Link to="/ai-training" onClick={() => logger.action('Open: AI Training', { path: '/ai-training' })}>{t('AI Training')}</Link>
                <Link to="/ai-platform" onClick={() => logger.action('Open: AI Platform', { path: '/ai-platform' })}>{t('AI Platform')}</Link>
                <Link to="/app-builder" onClick={() => logger.action('Open: App Builder', { path: '/app-builder' })}>App Builder</Link>
                <Link to="/studio" onClick={() => logger.action('Open: Workspace Studio', { path: '/studio' })}>{t('Workspace Studio')}</Link>
                <Link to="/control-center" onClick={() => logger.action('Open: Control Center', { path: '/control-center' })}>{t('Control Center')}</Link>
                <Link to="/models/gpt" onClick={() => logger.action('Open: Model library', { path: '/models/gpt' })}>{t('Model library')}</Link>
              </nav>
            </SidebarSection>

            <button type="button" className="sidebar-settings-row" onClick={() => goTo('/chat/settings', 'Settings')}>
              <IconSidebarSettings />
              <span>
                <strong>{t('Settings')}</strong>
                <small>{themePreference} · {chatTextColors.find(([, color]) => color === textColor)?.[0] || 'Custom'}</small>
              </span>
              <span className="sidebar-settings-chevron" aria-hidden="true">›</span>
            </button>

            <div className="chat-profile chat-profile-compact">
              <span className="chat-profile-avatar" aria-hidden="true">{user.name?.charAt(0) || user.email.charAt(0)}</span>
              <div className="chat-profile-meta">
                <strong>{user.name || t('User')}</strong>
                <small>{user.email}</small>
              </div>
              <button type="button" className="chat-profile-signout" onClick={() => setDeleteModalOpen(true)} aria-label={t('Sign out')} title={t('Sign out')}>↗</button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
