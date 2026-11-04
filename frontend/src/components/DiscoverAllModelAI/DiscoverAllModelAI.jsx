import './DiscoverAllModelAI.css';

const FEATURES = [
  {
    id: 'models',
    title: 'Multiple AI Models',
    description: 'Explore AI in one workspace.',
    Icon: IconModels,
  },
  {
    id: 'code',
    title: 'Code & Development',
    description: 'Get help with programming.',
    Icon: IconCode,
  },
  {
    id: 'research',
    title: 'Research & Learning',
    description: 'Explore complex ideas.',
    Icon: IconResearch,
  },
  {
    id: 'chat',
    title: 'Smart Conversations',
    description: 'Chat, create and compare.',
    Icon: IconChat,
  },
];

function IconModels({ className = '' }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2a2 2 0 0 1 1.8 1.1l1.4 2.8 3.1.45a2 2 0 0 1 1.1 3.4l-2.2 2.2.5 3.1a2 2 0 0 1-2.9 2.1L12 16.9l-2.8 1.5a2 2 0 0 1-2.9-2.1l.5-3.1-2.2-2.2a2 2 0 0 1 1.1-3.4l3.1-.45L10.2 3.1A2 2 0 0 1 12 2Zm0 4.2-.9 1.8a1 1 0 0 1-.75.55l-2 .3 1.45 1.4a1 1 0 0 1 .28.88l-.35 2 1.77-.93a1 1 0 0 1 .93 0l1.77.93-.35-2a1 1 0 0 1 .28-.88l1.45-1.4-2-.3a1 1 0 0 1-.75-.55L12 6.2Z"
      />
    </svg>
  );
}

function IconCode({ className = '' }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8.5 7.5 4 12l4.5 4.5 1.4-1.4L6.8 12l3.1-3.1-1.4-1.4Zm7 0-1.4 1.4L17.2 12l-3.1 3.1 1.4 1.4L20 12l-4.5-4.5ZM13 4h-2l1 16h2l-1-16Z"
      />
    </svg>
  );
}

function IconResearch({ className = '' }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M10.5 3a7 7 0 0 1 5.25 11.68l4.01 4.01-1.41 1.41-4.01-4.01A7 7 0 1 1 10.5 3Zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z"
      />
    </svg>
  );
}

function IconChat({ className = '' }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8l-4 3v-3H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2v9h1.17L6 17.17V15h14V6H4Z"
      />
    </svg>
  );
}

export default function DiscoverAllModelAI() {
  return (
    <section className="discover-ama" id="discover" aria-labelledby="discover-ama-heading">
      <div className="discover-ama-glow" aria-hidden="true" />

      <div className="discover-ama-inner">
        <div className="discover-ama-copy">
          <p className="discover-ama-kicker">
            <span className="discover-ama-kicker-mark" aria-hidden="true">
              ✦
            </span>
            Discover AllModelAI
          </p>
          <h2 id="discover-ama-heading">One Platform. Multiple AI Models. Endless Possibilities.</h2>
          <div className="discover-ama-body">
            <p>
              AllModelAI is an intelligent AI workspace designed to bring multiple powerful artificial intelligence
              models together in one place.
            </p>
            <p>
              Instead of switching between different AI applications, explore models, ask questions, compare responses,
              and choose the right AI assistant for your needs.
            </p>
            <p>
              Whether you&apos;re a developer, student, researcher, creator, or business professional, AllModelAI helps
              you make the most of artificial intelligence.
            </p>
          </div>
        </div>

        <ul className="discover-ama-features">
          {FEATURES.map(({ id, title, description, Icon }) => (
            <li key={id} className="discover-ama-feature">
              <span className="discover-ama-feature-icon">
                <Icon />
              </span>
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            </li>
          ))}
        </ul>

        <a className="discover-ama-cta" href="#models">
          Explore AllModelAI
        </a>
      </div>
    </section>
  );
}
