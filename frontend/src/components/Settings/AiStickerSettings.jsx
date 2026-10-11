import { useState } from 'react';
import { readAiStickersEnabled, writeAiStickersEnabled } from '../../lib/aiStickers/settings';
import { AI_STICKER_LIST } from '../../lib/aiStickers/catalog';

export default function AiStickerSettings() {
  const [enabled, setEnabled] = useState(() => readAiStickersEnabled());

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    writeAiStickersEnabled(next);
  };

  return (
    <section id="ai-stickers" className="settings-card settings-card-stickers">
      <h2>AI chat stickers</h2>
      <p className="settings-field-hint">
        Friendly emoji reactions appear below some assistant replies when the tone fits — not on every message.
        Your golden dragon logo stays unchanged.
      </p>
      <label className="settings-toggle-row">
        <input type="checkbox" checked={enabled} onChange={toggle} />
        <span>Automatic emoji stickers in chat</span>
      </label>
      <div className="settings-sticker-preview" aria-hidden="true">
        {AI_STICKER_LIST.slice(0, 6).map((item) => (
          <span key={item.id} title={item.label}>
            {item.emoji}
          </span>
        ))}
      </div>
    </section>
  );
}
