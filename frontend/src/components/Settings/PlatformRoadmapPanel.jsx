import { useCallback, useEffect, useState } from 'react';
import { fetchPlatformCapabilities } from '../../lib/platformApi';
import './PlatformRoadmapPanel.css';

function statusLabel(status) {
  if (status === 'available') return 'Available';
  if (status === 'beta') return 'Beta';
  if (status === 'planned') return 'Planned';
  return 'Disabled';
}

export default function PlatformRoadmapPanel() {
  const [capabilities, setCapabilities] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setCapabilities(await fetchPlatformCapabilities());
    } catch (loadError) {
      setError(loadError.message || 'Could not load platform status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <section className="settings-panel platform-roadmap-panel" aria-busy="true">
        <p className="settings-note">Loading advanced systems status…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="settings-panel platform-roadmap-panel">
        <p className="settings-error" role="alert">{error}</p>
      </section>
    );
  }

  return (
    <section className="settings-panel platform-roadmap-panel" id="settings-platform-roadmap">
      <h2>Advanced AI systems</h2>
      <p className="settings-note">
        Phased rollout status for memory, knowledge, research, video, voice, code execution, and agents.
        Infrastructure: {capabilities?.infrastructure?.databaseEngine}
        {capabilities?.infrastructure?.vector?.pgvectorAvailable ? ' · pgvector' : ' · JSON embeddings'}
      </p>
      <ul className="platform-roadmap-list">
        {capabilities?.features?.map((feature) => (
          <li key={feature.id} className={`platform-roadmap-item platform-roadmap-item--${feature.status}`}>
            <div className="platform-roadmap-item__head">
              <strong>{feature.name}</strong>
              <span className="platform-roadmap-phase">Phase {feature.phase}</span>
            </div>
            <p>{feature.description}</p>
            <div className="platform-roadmap-meta">
              <span className={`platform-roadmap-badge platform-roadmap-badge--${feature.status}`}>
                {statusLabel(feature.status)}
              </span>
              {!feature.enabled && feature.hint && (
                <small className="platform-roadmap-hint">{feature.hint}</small>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
