import './Stickers.css';

export default function Stickers() {
  return (
    <section className="stickers-section">
      <div className="stickers-container">
        <div className="sticker animate-float-1">
          <span>🚀</span> Ultra Fast
        </div>
        <div className="sticker animate-float-2">
          <span>🔒</span> Secure API
        </div>
        <div className="sticker animate-float-3">
          <span>🛠️</span> 99.9% Uptime
        </div>
        <div className="sticker animate-float-4">
          <span>🌐</span> Edge Routing
        </div>
      </div>
    </section>
  );
}
