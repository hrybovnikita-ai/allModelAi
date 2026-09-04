import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import '../NextTen/NextTen.css';
import '../NextTwentyFive/NextTwentyFive.css';

const prompt = (role, output) => `Act as ${role}. Be practical, protect secrets, state assumptions, and produce ${output}.\n\nUSER INPUT:\n`;

const ideas = [
  ['setup', 'API Setup Wizard', 'Connections', 'Configure AI providers safely and verify every required setting.', '/settings'],
  ['health', 'Provider Health Check', 'Connections', 'See which model providers are configured and currently available.', null],
  ['fallback', 'Fallback Chain Builder', 'Reliability', 'Design the order used when a preferred model is unavailable.', '/chat/settings'],
  ['errors', 'AI Error Explainer', 'Reliability', 'Turn a technical provider error into a clear diagnosis and repair checklist.', null, prompt('an AI API support engineer', 'the probable cause, safe checks, exact repair steps, and a prevention checklist')],
  ['speed', 'Model Speed Test', 'Models', 'Prepare a fair latency and response-quality benchmark across several models.', '/arena'],
  ['budget', 'Budget Protection', 'Safety', 'Plan daily and monthly provider limits, warnings, and automatic cutoffs.', null, prompt('an AI FinOps specialist', 'a provider budget, warning thresholds, hard limits, fallback rules, and a monitoring plan')],
  ['local', 'Local Model Installer', 'Privacy', 'Connect Ollama and manage models that run directly on your computer.', '/expansion-hub?feature=local'],
  ['private', 'Private Chat Mode', 'Privacy', 'Start a temporary conversation that is excluded from history and memory.', '/chat?temporary=true'],
  ['context', 'AI Context Inspector', 'Trust', 'Review the instructions, memory, documents, and sources supplied to a model.', '/studio?tool=memory'],
  ['versions', 'Response Version History', 'Workspace', 'Keep alternative answers created by retries, edits, branches, and model changes.', '/chat'],
  ['retry', 'Smart Retry', 'Reliability', 'Retry failed requests and continue with the best configured fallback model.', '/chat?model=smart'],
  ['center', 'Connection Center', 'Connections', 'Manage provider availability, configuration guidance, errors, and test requests.', '/control-center'],
];

const categories = ['All', ...new Set(ideas.map((idea) => idea[2]))];

export default function NextTwelve() {
  const saved = sessionStorage.getItem('allmodelai_user');
  const user = saved ? JSON.parse(saved) : null;
  const navigate = useNavigate();
  const [active, setActive] = useState(ideas[0][0]);
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [input, setInput] = useState('');
  const [modelStatus, setModelStatus] = useState(null);
  const [statusError, setStatusError] = useState('');
  const visible = useMemo(() => ideas.filter((idea) => (category === 'All' || idea[2] === category) && `${idea[1]} ${idea[2]} ${idea[3]}`.toLowerCase().includes(query.toLowerCase())), [category, query]);
  const selected = ideas.find((idea) => idea[0] === active) || ideas[0];

  useEffect(() => {
    if (active !== 'health') return;
    fetch('/api/status/models').then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Could not check providers.');
      setModelStatus(data);
    }).catch((error) => setStatusError(error.message));
  }, [active]);

  if (!user) return <Navigate to="/" replace />;
  const launch = () => {
    if (selected[5]) {
      if (!input.trim()) return;
      navigate('/chat?model=smart', { state: { starterPrompt: `${selected[5]}${input}` } });
    } else navigate(selected[4]);
  };

  return <main className="next-ten-page next-25-page">
    <header className="next-ten-nav"><Link to="/dashboard" className="next-ten-brand"><b>AI</b>AllModelAI</Link><nav><Link to="/next-15">15 Ideas</Link><Link to="/chat">Chat</Link><Link to="/dashboard">Dashboard</Link></nav></header>
    <section className="next-ten-hero"><div><p>ALLMODEL AI · CONNECTION & RELIABILITY</p><h1>Stay connected.<br/><span>Recover automatically.</span></h1><small>Twelve practical additions for provider setup, health, privacy, cost control, diagnostics, and resilient AI conversations.</small></div><strong>12</strong></section>
    <section className="next-25-toolbar"><label><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search 12 tools..." aria-label="Search connection tools" /></label><div>{categories.map((value) => <button type="button" className={category === value ? 'active' : ''} onClick={() => setCategory(value)} key={value}>{value}</button>)}</div></section>
    <section className="next-ten-shell next-25-shell"><aside>{visible.map((idea) => <button type="button" className={active === idea[0] ? 'active' : ''} onClick={() => { setActive(idea[0]); setInput(''); setStatusError(''); }} key={idea[0]}><i>{String(ideas.indexOf(idea) + 1).padStart(2, '0')}</i><span>✦</span><div><strong>{idea[1]}</strong><small>{idea[2]}</small></div></button>)}</aside>
      <article className="next-ten-panel"><div className="next-ten-panel-title"><span>{String(ideas.findIndex((idea) => idea[0] === selected[0]) + 1).padStart(2, '0')}</span><div><small>{selected[2].toUpperCase()} MODULE</small><h2>{selected[1]}</h2></div></div><p className="next-ten-description">{selected[3]}</p>
        {active === 'health' ? <div className="agent-team"><label>Live provider status</label>{statusError && <p className="verify-error">{statusError}</p>}<div className="agent-role-grid">{modelStatus ? Object.entries(modelStatus.models).map(([name, online]) => <div key={name}><i>{online ? '✓' : '!'}</i><strong>{name}</strong><small>{online ? 'Configured' : 'API key required'}</small></div>) : <p>Checking backend configuration…</p>}</div></div> : selected[5] ? <div className="agent-team"><label>Error, requirements, or configuration<textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Paste the error or describe your requirements..." /></label></div> : <div className="next-ten-flow"><div><i>1</i><span>Open module</span></div><b>→</b><div><i>2</i><span>Configure</span></div><b>→</b><div><i>3</i><span>Verify</span></div></div>}
        {active !== 'health' && <button className="next-ten-launch" type="button" disabled={Boolean(selected[5]) && !input.trim()} onClick={launch}>{selected[5] ? `Run ${selected[1]}` : `Open ${selected[1]}`} <span>→</span></button>}<footer><span>● Security-aware</span><small>API secrets remain on the backend and are never displayed in this page.</small></footer>
      </article>
    </section>
  </main>;
}
