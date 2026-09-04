import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import '../NextTen/NextTen.css';
import '../NextTwentyFive/NextTwentyFive.css';

const prompt = (role, output) => `Act as ${role}. Ask only essential questions, state assumptions, and produce ${output}.\n\nUSER INPUT:\n`;

const ideas = [
  ['briefing', 'AI Daily Briefing', 'Productivity', 'Create a personal morning briefing from tasks, meetings, news, and unfinished projects.', null, prompt('a proactive executive assistant', 'a concise daily briefing with priorities, schedule, risks, and the three best next actions')],
  ['battle-history', 'Model Battle History', 'Models', 'Review previous model comparisons and identify which model performs best for each task.', '/arena'],
  ['style-clone', 'AI Writing Style Clone', 'Content', 'Analyze writing samples and create a reusable personal voice profile.', null, prompt('a writing-style analyst', 'a style profile covering tone, rhythm, vocabulary, structure, do/don’t rules, and a reusable system prompt')],
  ['quality-alerts', 'Response Quality Alerts', 'Trust', 'Detect contradictions, weak evidence, uncertainty, and potentially outdated information.', null, prompt('a strict response-quality reviewer', 'alerts ordered by severity, quoted problem areas, explanations, corrections, and verification steps')],
  ['prompt-collections', 'Shared Prompt Collections', 'Team', 'Build reusable prompt libraries that teammates can share, review, and improve.', '/prompts'],
  ['form-builder', 'AI Form Builder', 'Build', 'Generate surveys, questionnaires, registrations, and feedback forms from a description.', null, prompt('a product designer specializing in accessible forms', 'a complete form specification with sections, field types, validation, conditional logic, confirmation text, and privacy notes')],
  ['conversation-workflow', 'Conversation-to-Workflow', 'Automation', 'Turn a successful conversation into a reusable sequence of automated AI steps.', '/expansion-hub?feature=workflow'],
  ['knowledge-vault', 'Private Knowledge Vault', 'Knowledge', 'Store sensitive project documents with controlled access and grounded AI retrieval.', '/studio?tool=documents'],
  ['decision', 'AI Decision Assistant', 'Productivity', 'Compare options across cost, benefits, risks, effort, and your own criteria.', null, prompt('an impartial decision analyst', 'a weighted decision matrix, assumptions, risks, sensitivity analysis, recommendation, and conditions that would change it')],
  ['focus', 'Focus Mode', 'Workspace', 'Open a distraction-free environment containing only the conversation and current task.', '/chat?mode=focus'],
  ['ab-testing', 'Prompt A/B Testing', 'Prompts', 'Compare two prompt variants and evaluate which one produces better results.', '/innovation-lab?feature=evaluations'],
  ['learning', 'AI Learning Paths', 'Learning', 'Create personalized lessons, exercises, checkpoints, and progress plans.', null, prompt('an adaptive learning designer', 'a personalized learning path with goals, weekly lessons, practice tasks, checkpoints, and mastery criteria')],
  ['activity', 'Workspace Activity Feed', 'Team', 'Follow new documents, prompts, agents, workflow runs, and team changes.', '/production'],
  ['export', 'Export Center', 'Workspace', 'Prepare conversations and results for PDF, DOCX, Markdown, JSON, and CSV export.', '/settings'],
  ['notifications', 'AI Notification Center', 'Productivity', 'Track completed jobs, model errors, usage limits, and workspace updates.', '/production'],
];

const categories = ['All', ...new Set(ideas.map((idea) => idea[2]))];

export default function NextFifteen() {
  const saved = sessionStorage.getItem('allmodelai_user');
  const user = saved ? JSON.parse(saved) : null;
  const navigate = useNavigate();
  const [active, setActive] = useState(ideas[0][0]);
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [input, setInput] = useState('');
  const visible = useMemo(() => ideas.filter((idea) => (category === 'All' || idea[2] === category) && `${idea[1]} ${idea[2]} ${idea[3]}`.toLowerCase().includes(query.toLowerCase())), [category, query]);
  const selected = ideas.find((idea) => idea[0] === active) || ideas[0];
  if (!user) return <Navigate to="/" replace />;

  const launch = () => {
    if (selected[5]) {
      if (!input.trim()) return;
      navigate('/chat?model=smart', { state: { starterPrompt: `${selected[5]}${input}` } });
    } else navigate(selected[4]);
  };

  return <main className="next-ten-page next-25-page">
    <header className="next-ten-nav"><Link to="/dashboard" className="next-ten-brand"><b>AI</b>AllModelAI</Link><nav><Link to="/next-30">30 Features</Link><Link to="/chat">Chat</Link><Link to="/dashboard">Dashboard</Link></nav></header>
    <section className="next-ten-hero"><div><p>ALLMODEL AI · 15 NEW IDEAS</p><h1>Know more.<br/><span>Work with confidence.</span></h1><small>Fifteen connected tools for daily planning, quality control, team knowledge, automation, learning, and export.</small></div><strong>15</strong></section>
    <section className="next-25-toolbar"><label><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search 15 new ideas..." aria-label="Search new ideas" /></label><div>{categories.map((value) => <button type="button" className={category === value ? 'active' : ''} onClick={() => setCategory(value)} key={value}>{value}</button>)}</div></section>
    <section className="next-ten-shell next-25-shell"><aside>{visible.map((idea) => <button type="button" className={active === idea[0] ? 'active' : ''} onClick={() => { setActive(idea[0]); setInput(''); }} key={idea[0]}><i>{String(ideas.indexOf(idea) + 1).padStart(2, '0')}</i><span>✦</span><div><strong>{idea[1]}</strong><small>{idea[2]}</small></div></button>)}</aside>
      <article className="next-ten-panel"><div className="next-ten-panel-title"><span>{String(ideas.findIndex((idea) => idea[0] === selected[0]) + 1).padStart(2, '0')}</span><div><small>{selected[2].toUpperCase()} MODULE</small><h2>{selected[1]}</h2></div></div><p className="next-ten-description">{selected[3]}</p>
        {selected[5] ? <div className="agent-team"><label>What should the tool work on?<textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Describe your goal or paste the source material..." /></label></div> : <div className="next-ten-flow"><div><i>1</i><span>Open module</span></div><b>→</b><div><i>2</i><span>Add context</span></div><b>→</b><div><i>3</i><span>Review & save</span></div></div>}
        <button className="next-ten-launch" type="button" disabled={Boolean(selected[5]) && !input.trim()} onClick={launch}>{selected[5] ? `Run ${selected[1]}` : `Open ${selected[1]}`} <span>→</span></button><footer><span>● Module ready</span><small>Connected to Smart Router, workspace, projects, and usage controls.</small></footer>
      </article>
    </section>
  </main>;
}
