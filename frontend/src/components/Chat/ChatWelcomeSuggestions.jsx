import './ChatWelcomeSuggestions.css';

function IconLightbulb() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 18h6M10 22h4M12 2a6 6 0 0 0-4 10.5V15a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.5A6 6 0 0 0 12 2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCode() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 8L4 12l4 4M16 8l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 4l-4 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconAi() {
  return <span className="welcome-suggestion-card__ai-label">AI</span>;
}

const ICONS = {
  idea: IconLightbulb,
  code: IconCode,
  ai: IconAi,
};

/**
 * Premium welcome action cards. Preserves existing prompt/action behavior.
 * @param {{ items: Array<{ title: string, prompt?: string, icon?: string, action?: string }>, onSelect: (prompt: string, item: object) => void, t: (s: string) => string }} props
 */
export default function ChatWelcomeSuggestions({ items, onSelect, t }) {
  return (
    <div className="welcome-suggestion-cards" role="group" aria-label={t('Suggestion prompts') || 'Suggestion prompts'}>
      {items.map((item, index) => {
        const Icon = ICONS[item.icon] || IconLightbulb;
        const title = t(item.title) || item.title;
        const desc = t(item.prompt) || item.prompt || '';
        return (
          <button
            key={item.title}
            type="button"
            className="welcome-suggestion-card"
            style={{ '--welcome-card-index': index }}
            onClick={() => onSelect(item.prompt || '', item)}
            aria-label={title}
          >
            <span className="welcome-suggestion-card__icon-wrap">
              <span className="welcome-suggestion-card__icon">
                <Icon />
              </span>
            </span>
            <span className="welcome-suggestion-card__body">
              <span className="welcome-suggestion-card__title">{title}</span>
              <span className="welcome-suggestion-card__desc">{desc}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
