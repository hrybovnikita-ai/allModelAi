import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { copyToClipboard } from '../../lib/clipboard';
import { ModelDetailIcon } from './ModelDetailIcons';

export default function ModelDetailPromptGallery({
  slug,
  prompts,
  accessible,
  onAccessDenied,
}) {
  const navigate = useNavigate();
  const [copiedId, setCopiedId] = useState('');

  const copyPrompt = async (id, text) => {
    if (!await copyToClipboard(text)) return;
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(''), 1600);
  };

  const tryInChat = (prompt) => {
    if (!accessible) {
      onAccessDenied?.();
      return;
    }
    navigate(`/chat?model=${encodeURIComponent(slug)}`, {
      state: { starterPrompt: prompt },
    });
  };

  return (
    <section className="model-detail-section" id="model-prompts" aria-labelledby="model-prompts-title">
      <header className="model-detail-section__head">
        <div>
          <p className="dashboard-eyebrow">Prompt gallery</p>
          <h2 id="model-prompts-title">Try these prompts</h2>
        </div>
        <p>Copy a prompt or open chat with it prefilled — nothing is sent until you press Send.</p>
      </header>

      <div className="model-detail-prompt-grid">
        {prompts.map((item, index) => {
          const id = `${slug}-prompt-${index}`;
          return (
            <article key={id} className="model-detail-prompt-card glass-panel">
              <div className="model-detail-prompt-card__head">
                <ModelDetailIcon name={item.category} />
                <h3>{item.title}</h3>
              </div>
              <p className="model-detail-prompt-card__preview">{item.prompt}</p>
              <div className="model-detail-prompt-card__actions">
                <button
                  type="button"
                  className="model-detail-btn model-detail-btn--ghost"
                  onClick={() => { void copyPrompt(id, item.prompt); }}
                >
                  {copiedId === id ? 'Copied' : 'Copy Prompt'}
                </button>
                <button
                  type="button"
                  className="model-detail-btn model-detail-btn--secondary"
                  onClick={() => tryInChat(item.prompt)}
                >
                  Try in Chat
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
