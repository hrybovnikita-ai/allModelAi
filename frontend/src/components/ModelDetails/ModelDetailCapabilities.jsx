import { capabilityCardsForSlug } from '../../data/modelCapabilitiesMeta';
import { ModelDetailIcon } from './ModelDetailIcons';

export default function ModelDetailCapabilities({ slug, strengths = [] }) {
  const cards = capabilityCardsForSlug(slug);

  return (
    <section className="model-detail-section" id="model-capabilities" aria-labelledby="model-capabilities-title">
      <header className="model-detail-section__head">
        <div>
          <p className="dashboard-eyebrow">Capabilities</p>
          <h2 id="model-capabilities-title">What this model does well</h2>
        </div>
        <p>Verified routing capabilities for this model in AllModelAI.</p>
      </header>

      {cards.length === 0 ? (
        <p className="model-detail-empty">Capability metadata is not available for this model yet.</p>
      ) : (
        <div className="model-detail-cap-grid">
          {cards.map((card) => (
            <article key={card.id} className="model-detail-cap-card glass-panel">
              <ModelDetailIcon name={card.id} className="model-detail-cap-card__icon" />
              <h3>{card.label}</h3>
              <p>{card.blurb}</p>
            </article>
          ))}
        </div>
      )}

      {strengths.length > 0 && (
        <div className="model-detail-strengths">
          <p className="dashboard-eyebrow">Highlights</p>
          <ul>
            {strengths.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
