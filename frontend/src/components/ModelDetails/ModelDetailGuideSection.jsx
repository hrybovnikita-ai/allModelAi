import { Link } from 'react-router-dom';

export default function ModelDetailGuideSection({
  model,
  versionLabel,
  guideContent,
  onTryGuidePrompt,
  accessible,
}) {
  if (!guideContent) return null;

  const sections = [
    { id: 'overview', title: `How ${versionLabel} approaches work`, body: guideContent.overview },
    { id: 'workflow', title: 'A productive workflow', body: guideContent.workflow },
    { id: 'best-for', title: 'Where it fits best', body: guideContent.bestFor },
    { id: 'caution', title: 'What to verify', body: guideContent.caution },
  ];

  return (
    <section className="model-detail-section model-detail-guide" id="model-guide" aria-labelledby="model-guide-title">
      <header className="model-detail-section__head">
        <div>
          <p className="dashboard-eyebrow">Model guide</p>
          <h2 id="model-guide-title">Build better work with {versionLabel}</h2>
        </div>
        <p>Practical patterns for prompts, research, code, writing, and collaboration.</p>
      </header>

      <div className="model-detail-guide-layout">
        <nav className="model-detail-guide-nav glass-panel" aria-label="Guide sections">
          <div className="model-detail-guide-nav__brand">
            <img src={model.image} alt="" />
            <div>
              <strong>{versionLabel}</strong>
              <span>{model.provider}</span>
            </div>
          </div>
          {sections.map((section) => (
            <a key={section.id} href={`#guide-${section.id}`}>{section.title}</a>
          ))}
          <Link to={`/chat?model=${model.slug}`}>Try in Chat</Link>
          <a href="#model-code">API examples</a>
        </nav>

        <div className="model-detail-guide-body">
          {sections.map((section) => (
            <article key={section.id} id={`guide-${section.id}`} className="model-detail-guide-article glass-panel">
              <h3>{section.title}</h3>
              <p>{section.body}</p>
            </article>
          ))}

          <article className="model-detail-guide-prompt glass-panel">
            <span className="model-detail-guide-prompt__label">Try this prompt</span>
            <p>{guideContent.prompt}</p>
            <div className="model-detail-guide-prompt__actions">
              <button
                type="button"
                className="model-detail-btn model-detail-btn--secondary"
                disabled={!accessible}
                onClick={() => onTryGuidePrompt(guideContent.prompt)}
              >
                Try in Chat
              </button>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
