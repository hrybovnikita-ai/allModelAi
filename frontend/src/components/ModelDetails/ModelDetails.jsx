import { useState } from 'react';
import { Link, Navigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { dashboardModels } from '../../data/dashboardModels';
import { modelGuides } from '../../data/modelGuides';
import DashboardWorkspaceNav from '../Dashboard/DashboardWorkspaceNav';
import '../Dashboard/Dashboard.css';
import '../Dashboard/DashboardNav.css';
import '../Dashboard/DashboardDarkViolet.css';
import '../Dashboard/DashboardLayout.css';
import './ModelDetails.css';
import './ModelDetailsDarkViolet.css';
import './ModelCode.css';
import './ModelGuideUnique.css';

const versionNames = {
  'claude-opus-4.1': 'Claude Opus',
  'claude-sonnet-4.6': 'Claude Sonnet',
  'claude-haiku-4.5': 'Claude Haiku',
};

export default function ModelDetails() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useOutletContext();
  const model = dashboardModels.find((item) => item.slug === slug);
  const [copied, setCopied] = useState('');
  const [authError, setAuthError] = useState('');

  if (!model) return <Navigate to="/dashboard" replace />;

  const selectedVersion = versionNames[searchParams.get('version')];
  const versionLabel = selectedVersion || model.name;
  const guideContent = modelGuides[model.slug] || modelGuides.smart;

  const copyCode = async (language, code) => {
    await navigator.clipboard.writeText(code);
    setCopied(language);
    window.setTimeout(() => setCopied(''), 1600);
  };

  return (
    <main className="dashboard-page dashboard-violet model-page">
      <DashboardWorkspaceNav user={user} onAuthError={setAuthError} />
      <div className="dashboard-shell">
        {authError ? (
          <p role="alert" className="model-auth-error">
            {authError}
          </p>
        ) : null}

        <div className="model-back-row">
          <Link to="/dashboard">← Back to models</Link>
        </div>

        <section className="model-page-hero">
          <div className="model-page-copy">
            <p className="dashboard-eyebrow">{model.provider} model</p>
            <h1>{versionLabel}</h1>
            <p>{model.description}</p>
            <div className="model-page-actions">
              <Link to={`/chat?model=${model.slug}`} className="model-action-primary">
                Start with {model.name}
              </Link>
              <a href="#model-code">View code example</a>
              <a href="#model-guide">Read guide</a>
            </div>
          </div>
          <div className="model-page-image">
            <div>
              <img src={model.image} alt={`${model.name} by ${model.provider}`} />
            </div>
            <span>{model.provider}</span>
            <strong>{model.name}</strong>
          </div>
        </section>

        <section className="model-control-bar" aria-label="Model actions">
          <div>
            <span className="dashboard-eyebrow">Selected version</span>
            <strong>{versionLabel}</strong>
          </div>
          <div className="model-control-actions">
            <Link to={`/chat?model=${model.slug}`}>Open chat</Link>
            <a
              href={`https://www.google.com/search?q=${encodeURIComponent(`${model.provider} ${model.name} documentation`)}`}
              target="_blank"
              rel="noreferrer"
            >
              Provider docs
            </a>
            <a href="#model-guide">Explore capabilities</a>
          </div>
        </section>

        <section className="model-page-info" id="model-strengths">
          <div>
            <p className="dashboard-eyebrow">Why choose {model.name}</p>
            <h2>Built for ambitious work.</h2>
          </div>
          <div className="model-strengths">
            {model.strengths.map((strength, index) => (
              <article key={strength}>
                <span>0{index + 1}</span>
                <h3>{strength}</h3>
                <p>
                  Use {model.name} when your project needs {strength.toLowerCase()} with a simple unified API.
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="model-code model-code-dual" id="model-code">
          <div className="model-code-intro">
            <p className="dashboard-eyebrow">Quick start</p>
            <h2>Use {model.name} in your code.</h2>
            <p>Choose JavaScript or Python. Both examples send the same request through the unified AllModelAI API.</p>
          </div>
          <div className="code-examples">
            <article>
              <header>
                <span>
                  <b>JS</b> JavaScript
                </span>
                <button type="button" onClick={() => copyCode('js', model.codeJs)}>
                  {copied === 'js' ? 'Copied!' : 'Copy code'}
                </button>
              </header>
              <pre>
                <code>{model.codeJs}</code>
              </pre>
            </article>
            <article>
              <header>
                <span>
                  <b>PY</b> Python
                </span>
                <button type="button" onClick={() => copyCode('py', model.codePy)}>
                  {copied === 'py' ? 'Copied!' : 'Copy code'}
                </button>
              </header>
              <pre>
                <code>{model.codePy}</code>
              </pre>
            </article>
          </div>
        </section>

        <section className="model-guide" id="model-guide">
          <div className="model-guide-header">
            <div>
              <p className="dashboard-eyebrow">Model guide</p>
              <h2>Build better work with {versionLabel}.</h2>
            </div>
            <p>Explore practical patterns for prompts, research, code, writing, and everyday collaboration.</p>
          </div>
          <div className="model-guide-layout">
            <aside className="model-guide-aside">
              <div className="guide-preview">
                <img src={model.image} alt="" />
                <strong>{versionLabel}</strong>
                <span>{model.provider}</span>
              </div>
              <a href="#model-code">API examples</a>
              <a href="#model-strengths">Capabilities</a>
              <Link to={`/chat?model=${model.slug}`}>Try in chat</Link>
            </aside>
            <article className="model-guide-copy">
              <h3>How {versionLabel} approaches work</h3>
              <p>{guideContent.overview}</p>
              <h3>A productive workflow</h3>
              <p>{guideContent.workflow}</p>
              <h3>Where it fits best</h3>
              <p>{guideContent.bestFor}</p>
              <div className="guide-prompt-example">
                <span>TRY THIS PROMPT</span>
                <p>{guideContent.prompt}</p>
              </div>
              <h3>What to verify</h3>
              <p>{guideContent.caution}</p>
            </article>
          </div>
        </section>
      </div>
    </main>
  );
}
