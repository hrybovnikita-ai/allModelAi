import { useNavigate } from 'react-router-dom';
import { HERO_ORBIT_PROVIDERS } from './heroOrbitProviders';
import './HeroProviderOrbit.css';

const INNER = HERO_ORBIT_PROVIDERS.filter((p) => p.ring === 'inner');
const OUTER = HERO_ORBIT_PROVIDERS.filter((p) => p.ring === 'outer');

function OrbitRing({ items, radius, duration, className }) {
  const navigate = useNavigate();
  const total = items.length;

  return (
    <div
      className={`hero-orbit-ring ${className || ''}`}
      style={{ '--orbit-duration': `${duration}s`, '--orbit-radius': radius }}
    >
      {items.map((item, index) => {
        const badge = (
          <span className="hero-orbit-badge">
            <img src={item.image} alt="" width={28} height={28} loading="lazy" decoding="async" />
            <span className="hero-orbit-badge-label">{item.name}</span>
          </span>
        );

        return (
          <div
            key={`${item.slug}-${index}`}
            className="hero-orbit-anchor"
            style={{ '--orbit-i': index, '--orbit-total': total }}
          >
            <div className="hero-orbit-badge-upright">
              {item.href ? (
                <button
                  type="button"
                  className="hero-orbit-badge-btn"
                  onClick={() => navigate(item.href)}
                  aria-label={`Open ${item.name} in chat`}
                >
                  {badge}
                </button>
              ) : (
                <span className="hero-orbit-badge-btn hero-orbit-badge-btn--static">{badge}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function HeroProviderOrbit() {
  return (
    <section
      className="hero-orbit"
      aria-label="AI providers available through Smart Router"
    >
      <div className="hero-orbit-glow" aria-hidden="true" />
      <div className="hero-orbit-stage">
        <div className="hero-orbit-ring hero-orbit-ring--guide hero-orbit-ring--guide-outer" aria-hidden="true" />
        <div className="hero-orbit-ring hero-orbit-ring--guide hero-orbit-ring--guide-inner" aria-hidden="true" />
        <OrbitRing items={OUTER} radius="var(--orbit-outer-r)" duration={52} className="hero-orbit-ring--outer" />
        <OrbitRing items={INNER} radius="var(--orbit-inner-r)" duration={44} className="hero-orbit-ring--inner" />
        <div className="hero-orbit-core" aria-hidden="true">
          <span className="hero-orbit-core-ai">AI</span>
          <small>SMART ROUTER</small>
        </div>
      </div>
      <p className="hero-orbit-caption">
        Decorative preview of connected providers — Smart Router routes to configured models at runtime.
      </p>
    </section>
  );
}
