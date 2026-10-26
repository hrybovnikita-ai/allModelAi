import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { dashboardModels } from '../../data/dashboardModels';
import { normalizeModelStatusMap } from '../../data/ollamaCloudVariants';
import { resolveModelLibraryCardStatus } from '../../lib/modelLibraryStatus';
import { resolveApiUrl } from '../../lib/apiBase';
import './ModelExplorer.css';
import { AllModelAILogoMark } from '../AllModelAILogo/AllModelAILogo';

const meta = {
  smart: ['Balanced', 'Auto', 'All tasks'],
  gpt: ['Fast', '$$', 'General'],
  claude: ['Medium', '$$$', 'Writing'],
  gemini: ['Very fast', '$', 'Multimodal'],
  deepseek: ['Fast', '$', 'Coding'],
  perplexity: ['Fast', '$$', 'Research'],
  cloudflare: ['Very fast', '$', 'Open models'],
  mistral: ['Fast', '$', 'Multilingual'],
};

export default function ModelExplorer() {
  const [query, setQuery] = useState('');
  const [task, setTask] = useState('All');
  const [modelStatus, setModelStatus] = useState({});
  const [modelHealth, setModelHealth] = useState({});

  useEffect(() => {
    fetch(resolveApiUrl('/api/status/models'))
      .then((r) => r.json())
      .then((data) => {
        setModelStatus(normalizeModelStatusMap(data?.models || {}, data?.providers || {}));
        setModelHealth(data?.modelHealth && typeof data.modelHealth === 'object' ? data.modelHealth : {});
      })
      .catch(() => {});
  }, []);

  const list = useMemo(
    () => dashboardModels.filter(
      (model) => `${model.name} ${model.provider} ${model.note} ${model.strengths.join(' ')}`.toLowerCase().includes(query.toLowerCase())
        && (task === 'All'
          || model.strengths.some((s) => s.toLowerCase().includes(task.toLowerCase()))
          || model.note.toLowerCase().includes(task.toLowerCase())),
    ),
    [query, task],
  );

  return (
    <main className="explorer-page">
      <nav>
        <Link to="/" className="explorer-brand"><AllModelAILogoMark />AllModelAI</Link>
        <div>
          <Link to="/arena">AI Arena</Link>
          <Link to="/dashboard">Dashboard</Link>
        </div>
      </nav>
      <header>
        <p>MODEL EXPLORER</p>
        <h1>Find the right intelligence.</h1>
        <span>Compare capabilities, speed, cost, and providers.</span>
        <div className="explorer-search">
          <b>⌕</b>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search models or capabilities…" />
        </div>
        <div className="explorer-filters">
          {['All', 'Coding', 'Research', 'Writing', 'Multimodal'].map((item) => (
            <button className={task === item ? 'active' : ''} onClick={() => setTask(item)} key={item} type="button">{item}</button>
          ))}
        </div>
      </header>
      <section className="explorer-grid">
        {list.map((model) => {
          const details = meta[model.slug] || ['Fast', '$', 'General'];
          const cardStatus = resolveModelLibraryCardStatus(model.slug, modelStatus, modelHealth);
          const online = cardStatus.label !== 'Setup needed' && cardStatus.label !== 'Unavailable';
          return (
            <article key={model.slug}>
              <div className="model-top">
                <span className="explorer-logo">
                  <img src={model.image} alt="" width={36} height={36} />
                </span>
                <i className={online ? '' : 'offline'}>{cardStatus.label === 'Checking…' ? 'Checking…' : cardStatus.label}</i>
              </div>
              <small>{model.provider}</small>
              <h2>{model.name}</h2>
              <p>{model.note}</p>
              <div className="model-bars">
                <label>Speed <span style={{ width: details[0].includes('Very') ? '94%' : details[0] === 'Fast' ? '76%' : '58%' }} /></label>
                <label>Capability <span style={{ width: model.slug === 'smart' ? '96%' : '82%' }} /></label>
              </div>
              <div className="explorer-meta">
                <span>{details[0]}</span>
                <span>{details[1]} cost</span>
                <span>{details[2]}</span>
              </div>
              <footer>
                <Link to={`/chat?model=${model.slug}`}>Open chat</Link>
                <Link to={`/arena?models=${model.slug}`}>Compare</Link>
              </footer>
            </article>
          );
        })}
      </section>
    </main>
  );
}
