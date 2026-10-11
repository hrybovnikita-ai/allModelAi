import './ChatAiSticker.css';

export default function ChatAiSticker({ sticker }) {
  if (!sticker?.emoji) return null;
  const animated = sticker.animated !== false;
  return (
    <div
      className={`chat-ai-sticker ${animated ? 'chat-ai-sticker--animated' : ''}`}
      role="img"
      aria-label={sticker.label ? `${sticker.label} sticker` : 'Reaction sticker'}
    >
      <span className="chat-ai-sticker__emoji" aria-hidden="true">
        {sticker.emoji}
      </span>
      {sticker.label && <span className="chat-ai-sticker__label">{sticker.label}</span>}
    </div>
  );
}
