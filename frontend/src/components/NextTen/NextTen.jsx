import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import './NextTen.css';

const features = [
  { id: 'arena', icon: '⚔', title: 'Model Arena', label: 'Compare', text: 'Send one prompt to several models, compare answers side by side, and vote for the winner.', route: '/arena', action: 'Open Arena' },
  { id: 'router', icon: '⌁', title: 'Smart Model Router', label: 'Automatic', text: 'Let AllModelAI select the best model for quality, speed, availability, and price.', route: '/chat?model=smart', action: 'Try Smart Chat' },
  { id: 'agents', icon: '✦', title: 'AI Agent Team', label: 'Orchestrate', text: 'Give one goal to a researcher, creator, critic, and editor working as a coordinated team.', action: 'Configure team' },
  { id: 'workflow', icon: '⌘', title: 'Workflow Builder', label: 'Automate', text: 'Connect prompts, models, conditions, reviews, and outputs into reusable visual workflows.', route: '/studio?tool=chains', action: 'Build workflow' },
  { id: 'memory', icon: '◇', title: 'Project Memory', label: 'Context', text: 'Keep instructions, files, preferences, and important facts available across every related chat.', route: '/ai-tools?tool=memory', action: 'Manage memory' },
  { id: 'verify', icon: '✓', title: 'Multi-model Verifier', label: 'Quality', text: 'Draft with one model, inspect weaknesses with another, and produce a stronger final answer.', action: 'Verify an answer' },
  { id: 'usage', icon: '◫', title: 'Usage & Cost Center', label: 'Control', text: 'Track requests, tokens, model share, estimated spend, and monthly budget limits.', route: '/studio?tool=analytics', action: 'View analytics' },
  { id: 'tools', icon: '＋', title: 'AI Tools Library', label: 'Create', text: 'Launch research, documents, presentations, websites, local models, and specialist tools.', route: '/ai-tools', action: 'Browse tools' },
  { id: 'multi', icon: '◎', title: 'Multimodal Workspace', label: 'All formats', text: 'Work with text, images, audio, PDFs, tables, and source code in one connected workspace.', route: '/chat?feature=multimodal', action: 'Open workspace' },
  { id: 'market', icon: '▦', title: 'Agent Marketplace', label: 'Community', text: 'Discover reusable assistants, prompt packs, and proven workflows for common tasks.', route: '/prompts', action: 'Explore marketplace' },
];

const roles = [
  ['Researcher', 'Finds facts, constraints, and useful context'],
  ['Creator', 'Builds the first complete solution'],
  ['Critic', 'Finds gaps, risks, and weak assumptions'],
  ['Editor', 'Combines the strongest ideas into the final result'],
];

export default function NextTen() {
  const saved = sessionStorage.getItem('allmodelai_user');
  const user = saved ? JSON.parse(saved) : null;
  const navigate = useNavigate();
  const [active, setActive] = useState('arena');
  const [goal, setGoal] = useState('');
  const [answer, setAnswer] = useState('');
  const [quality, setQuality] = useState(null);
  const [checking, setChecking] = useState(false);
  const selected = useMemo(() => features.find(item => item.id === active) || features[0], [active]);

  if (!user) return <Navigate to="/" replace />;

  const launch = () => {
    if (selected.id === 'agents') {
      if (!goal.trim()) return;
      navigate('/arena', { state: { starterPrompt: `Work as a four-agent team (researcher, creator, critic, editor) on this goal: ${goal}` } });
      return;
    }
    if (selected.id === 'verify') return;
    navigate(selected.route);
  };

  const verify = async () => {
    if (!answer.trim()) return;
    setChecking(true);
    setQuality(null);
    try {
      const response = await fetch('/api/quality/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: answer }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Verification failed');
      setQuality(data);
    } catch (error) {
      setQuality({ error: error.message });
    } finally {
      setChecking(false);
    }
  };

  return <main className="next-ten-page">
    <header className="next-ten-nav"><Link to="/dashboard" className="next-ten-brand"><b>AI</b>AllModelAI</Link><nav><Link to="/chat">Chat</Link><Link to="/arena">Arena</Link><Link to="/dashboard">Dashboard</Link></nav></header>
    <section className="next-ten-hero"><div><p>ALLMODEL AI · NEXT 10</p><h1>Ten tools.<br/><span>One intelligent workspace.</span></h1><small>Compare, route, orchestrate, verify, remember, automate, and create with every model in one place.</small></div><strong>10</strong></section>
    <section className="next-ten-shell">
      <aside>{features.map((item, index) => <button type="button" className={active === item.id ? 'active' : ''} onClick={() => setActive(item.id)} key={item.id}><i>{String(index + 1).padStart(2, '0')}</i><span>{item.icon}</span><div><strong>{item.title}</strong><small>{item.label}</small></div></button>)}</aside>
      <article className="next-ten-panel">
        <div className="next-ten-panel-title"><span>{selected.icon}</span><div><small>{selected.label.toUpperCase()} MODULE</small><h2>{selected.title}</h2></div></div>
        <p className="next-ten-description">{selected.text}</p>
        {selected.id === 'agents' && <div className="agent-team"><div className="agent-role-grid">{roles.map(([name, text], index) => <div key={name}><i>{index + 1}</i><strong>{name}</strong><small>{text}</small></div>)}</div><label>Team goal<textarea value={goal} onChange={event => setGoal(event.target.value)} placeholder="Describe what the AI team should accomplish..." /></label></div>}
        {selected.id === 'verify' && <div className="verifier"><label>Answer to review<textarea value={answer} onChange={event => setAnswer(event.target.value)} placeholder="Paste an AI answer here..." /></label><button type="button" disabled={!answer.trim() || checking} onClick={verify}>{checking ? 'Checking…' : 'Run quality check'}</button>{quality?.error && <p className="verify-error">{quality.error}</p>}{quality?.score != null && <div className="verify-result"><strong>{quality.score}<small>/100</small></strong><div>{Object.entries(quality.metrics || {}).map(([name, value]) => <span key={name}><b>{name}</b><i>{value}</i></span>)}</div><ul>{quality.suggestions?.map(item => <li key={item}>{item}</li>)}</ul></div>}</div>}
        {!['agents', 'verify'].includes(selected.id) && <div className="next-ten-flow"><div><i>1</i><span>Choose your task</span></div><b>→</b><div><i>2</i><span>AllModelAI coordinates</span></div><b>→</b><div><i>3</i><span>Save the result</span></div></div>}
        {selected.id !== 'verify' && <button type="button" className="next-ten-launch" disabled={selected.id === 'agents' && !goal.trim()} onClick={launch}>{selected.action} <span>→</span></button>}
        <footer><span>● Connected</span><small>Your account, projects, and preferences stay available across all ten modules.</small></footer>
      </article>
    </section>
  </main>;
}
