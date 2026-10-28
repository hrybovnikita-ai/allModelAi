import ChatWelcomeSuggestions from './ChatWelcomeSuggestions';
import { ProjectIconBadge } from './CreateProjectModal';
import './ChatEmptyState.css';

/**
 * Central empty-chat welcome composition (orb, heading, suggestion cards).
 */
export default function ChatEmptyState({
  t,
  activeProject,
  temporaryChat,
  selectedModel,
  suggestions,
  onSelectSuggestion,
}) {
  const inProject = Boolean(activeProject && !temporaryChat);

  return (
    <div className="chat-welcome-container" data-welcome="true">
      <div className="chat-welcome-content chat-empty chat-empty--premium">
      <div className="chat-empty-hero">
        <div className="model-orb chat-empty-orb" aria-hidden="true">
          {inProject ? (
            <ProjectIconBadge project={activeProject} className="chat-empty-project-icon" />
          ) : (
            <img src={selectedModel.image} alt="" />
          )}
        </div>
        <p className="chat-eyebrow chat-empty-eyebrow">
          {inProject ? t('Projects') : `${selectedModel.provider} · ${selectedModel.name}`}
        </p>
        <h1 className="chat-empty-heading">
          {inProject ? activeProject.name : t('What can I help you create?')}
        </h1>
        <p className="chat-subtitle chat-empty-subtitle">
          {inProject
            ? t('Chats in this project stay grouped here.')
            : t('Start with your own question, upload a screenshot (Ctrl+V), or choose one of these ideas.')}
        </p>
      </div>

      {!inProject && (
        <ChatWelcomeSuggestions items={suggestions} onSelect={onSelectSuggestion} t={t} />
      )}
      </div>
    </div>
  );
}
