import { MODEL_TECH_SPECS, modalitiesForSlug } from '../../data/modelCapabilitiesMeta';

function Metric({ label, value }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="model-detail-metric">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export default function ModelDetailDashboard({
  model,
  operationalStatus,
  subscriptionLabel,
  usageNote,
}) {
  const specs = MODEL_TECH_SPECS[model.slug] || {};
  const modalities = modalitiesForSlug(model.slug);
  const modelId = specs.modelId || null;

  return (
    <section className="model-detail-section" id="model-dashboard" aria-labelledby="model-dashboard-title">
      <header className="model-detail-section__head">
        <div>
          <p className="dashboard-eyebrow">Model information</p>
          <h2 id="model-dashboard-title">Technical dashboard</h2>
        </div>
        <p>Live availability from AllModelAI status APIs where supported.</p>
      </header>

      <dl className="model-detail-dashboard glass-panel">
        <Metric label="Model identifier" value={modelId || 'Unknown'} />
        <Metric label="Provider" value={model.provider} />
        <Metric label="Modalities" value={modalities.join(' · ')} />
        <Metric label="Context window" value={specs.contextWindow || null} />
        <Metric label="Tools" value={specs.toolUse ? 'Supported in chat workflows' : null} />
        <Metric label="Subscription" value={subscriptionLabel} />
        <Metric label="Operational status" value={operationalStatus} />
        <Metric label="Usage limits" value={usageNote || null} />
      </dl>
    </section>
  );
}
