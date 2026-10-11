import { Link } from 'react-router-dom';
import { capabilityCardsForSlug } from '../../data/modelCapabilitiesMeta';

export default function ModelDetailHero({
  model,
  versionLabel,
  subscriptionLabel,
  accessible,
  onStartChat,
  compareHref,
}) {
  const capabilityPreview = capabilityCardsForSlug(model.slug).slice(0, 4);

  return (
    <section className="model-detail-hero glass-panel" aria-labelledby="model-detail-title">
      <div className="model-detail-hero__glow" aria-hidden="true" />
      <div className="model-detail-hero__copy">
        <p className="dashboard-eyebrow">{model.provider}</p>
        <h1 id="model-detail-title">{versionLabel}</h1>
        <p className="model-detail-hero__desc">{model.description}</p>

        {capabilityPreview.length > 0 && (
          <ul className="model-detail-hero__chips" aria-label="Supported capabilities">
            {capabilityPreview.map((cap) => (
              <li key={cap.id}>{cap.label}</li>
            ))}
          </ul>
        )}

        <p className="model-detail-hero__access">
          <span className="model-detail-hero__access-label">Access</span>
          {subscriptionLabel}
        </p>

        <div className="model-detail-hero__actions">
          <button
            type="button"
            className="model-action-primary model-detail-btn"
            onClick={onStartChat}
          >
            Start Chat
          </button>
          <Link to={compareHref} className="model-detail-btn model-detail-btn--secondary">
            Compare Models
          </Link>
          <a href="#model-prompts" className="model-detail-btn model-detail-btn--ghost">
            Example prompts
          </a>
        </div>

        {!accessible && (
          <p className="model-detail-hero__gate" role="note">
            This model requires an active subscription or developer access.{' '}
            <Link to="/checkout/pro">View plans</Link>
          </p>
        )}
      </div>

      <div className="model-detail-hero__visual">
        <div className="model-detail-hero__logo-ring">
          <img src={model.image} alt={`${model.name} logo`} />
        </div>
        <p className="model-detail-hero__provider">{model.provider}</p>
        <strong>{model.name}</strong>
        {model.priceLabel && (
          <span className="model-detail-hero__tier">{model.priceLabel}</span>
        )}
      </div>
    </section>
  );
}
