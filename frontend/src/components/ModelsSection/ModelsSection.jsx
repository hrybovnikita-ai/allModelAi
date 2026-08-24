import { useNavigate } from 'react-router-dom';
import './ModelsSection.css';

export default function ModelsSection({ models, selectedModel, setSelectedModel }) {
  const navigate = useNavigate();
  const currentModel = models[selectedModel];

  return (
    <div className="home-model-section">
      <section id="models" className="models-grid">
        <div className="grid-header">
          <h2>Choose Your Model</h2>
          <p>Compare and select from leading AI models</p>
        </div>

        <div className="model-cards">
          {Object.entries(models).map(([key, model]) => (
            <button
              key={key}
              className={`model-card ${selectedModel === key ? "active" : ""}`}
              onClick={() => setSelectedModel(key)}
              style={selectedModel === key ? { borderColor: model.color } : {}}
            >
              <div className="model-icon">
                <img src={model.logo} alt={model.name} />
              </div>
              <h3>{model.name}</h3>
              <p>{model.provider}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="model-details">
        <div className="details-header">
          <div className="details-logo">
            <img src={currentModel.logo} alt={currentModel.name} />
          </div>
          <h2>{currentModel.name}</h2>
          <span className="provider-badge">{currentModel.provider}</span>
        </div>
        <p className="model-description">{currentModel.description}</p>

        <div className="versions-section">
          <h3>Available Versions</h3>
          <div className="versions-list">
            {currentModel.versions.map((version, idx) => (
              <div key={idx} className="version-card">
                <div className="version-header">
                  <h4>{version.name}</h4>
                  <span className="tier-badge" data-tier={version.tier.toLowerCase()}>
                    {version.tier}
                  </span>
                </div>
                <div className="version-specs">
                  <div className="spec">
                    <span className="spec-label">Speed</span>
                    <span className="spec-value">{version.speed}</span>
                  </div>
                  <div className="spec">
                    <span className="spec-label">Capability</span>
                    <span className="spec-value">{version.capability}</span>
                  </div>
                </div>
                <button className="use-btn" style={{ backgroundColor: currentModel.color }} onClick={() => navigate(`/models/${selectedModel}?version=${version.id}`)}>
                  Use {version.name}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
