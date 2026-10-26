import './HeroAuraVisual.css';

const HIGHLIGHTS = [
  { label: 'Smart Router', detail: 'Picks the right model per task' },
  { label: 'Unified chat', detail: 'One thread, many providers' },
  { label: 'Pro unlock', detail: 'Premium models when you upgrade' },
];

export default function HeroAuraVisual() {
  return (
    <section className="hero-aura" aria-label="AllModelAI platform highlights">
      <div className="hero-aura-lights" aria-hidden="true">
        <span className="hero-aura-orb hero-aura-orb--1" />
        <span className="hero-aura-orb hero-aura-orb--2" />
        <span className="hero-aura-orb hero-aura-orb--3" />
        <span className="hero-aura-sweep" />
      </div>

      <div className="hero-aura-panel">
        <p className="hero-aura-eyebrow">AI intelligence layer</p>
        <h2 className="hero-aura-title">Built for depth, tuned for speed</h2>
        <p className="hero-aura-lede">
          A calm command surface with violet-lit depth — routing, chat, and subscriptions in one polished workspace.
        </p>

        <ul className="hero-aura-highlights">
          {HIGHLIGHTS.map((item) => (
            <li key={item.label}>
              <span className="hero-aura-dot" aria-hidden="true" />
              <span>
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
