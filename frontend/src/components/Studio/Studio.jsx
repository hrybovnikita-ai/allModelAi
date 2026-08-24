import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import './Studio.css';

const features = [
  ['router','Smart Router','Route by quality, speed, or price'], ['memory','Memory','Personal context you control'],
  ['project','Projects','Chats, instructions, and knowledge'], ['document','Documents','Ask questions about your files'],
  ['tools','AI Tools','Focused workflows for real tasks'], ['prompt','Prompt Library','Reusable prompt templates'],
  ['sources','Research','Answers designed for citations'], ['analytics','Analytics','Models, messages, and tokens'],
  ['branches','Branches','Explore another conversation path'],
];
const toolTemplates = [
  ['Improve writing','Rewrite the following text clearly and preserve its meaning:\n\n'],
  ['Review code','Review this code. Find bugs, security risks, and improvements:\n\n'],
  ['Study notes','Turn this material into concise study notes and a short quiz:\n\n'],
  ['Content plan','Create a 30-day content plan for this topic:\n\n'],
  ['Job interview','Run a realistic interview for this role:\n\n'],
  ['Translate','Translate naturally and explain important wording choices:\n\n'],
];

export default function Studio() {
  const navigate = useNavigate();
  const saved = sessionStorage.getItem('allmodelai_user');
  const user = saved ? JSON.parse(saved) : null;
  const [active, setActive] = useState('router');
  const [items, setItems] = useState([]);
  const [history, setHistory] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [form, setForm] = useState({ name:'', content:'', instructions:'' });
  const [routerMode, setRouterMode] = useState(localStorage.getItem('allmodelai_router_mode') || 'balanced');
  const dataType = ['memory','project','document','prompt'].includes(active) ? active : null;

  useEffect(() => {
    if (!user?.email) return;
    if (dataType) fetch(`/api/workspace?email=${encodeURIComponent(user.email)}&type=${dataType}`).then(r => r.json()).then(setItems).catch(() => setItems([]));
    if (active === 'analytics') fetch(`/api/analytics?email=${encodeURIComponent(user.email)}`).then(r => r.json()).then(setAnalytics);
    if (active === 'branches') fetch(`/api/chat/history?email=${encodeURIComponent(user.email)}`).then(r => r.json()).then(setHistory);
  }, [active, dataType, user?.email]);

  const title = useMemo(() => features.find(([key]) => key === active)?.[1], [active]);
  if (!user) return <Navigate to="/" replace />;

  const addItem = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    const response = await fetch('/api/workspace', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ email:user.email, type:dataType, ...form }) });
    if (response.ok) { const created = await response.json(); setItems(current => [created, ...current]); }
    setForm({ name:'', content:'', instructions:'' });
  };
  const removeItem = async (item) => {
    const response = await fetch(`/api/workspace/${item.id}`, { method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ email:user.email }) });
    if (response.ok) setItems(current => current.filter(entry => entry.id !== item.id));
  };
  const openChat = (prompt, model = 'smart') => navigate(`/chat?model=${model}`, { state:{ starterPrompt:prompt, routerMode } });
  const branch = async (conversation) => {
    const response = await fetch(`/api/chat/history/${conversation.id}/branch`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ email:user.email, messageCount:conversation.messages?.length || 1 }) });
    if (response.ok) navigate('/chat');
  };

  return <main className="studio-page">
    <header className="studio-header"><Link to="/dashboard" className="studio-brand"><span>AI</span>AllModelAI</Link><div><Link to="/chat">Open chat</Link><Link to="/dashboard">Dashboard</Link></div></header>
    <section className="studio-hero"><p>ALLMODEL WORKSPACE</p><h1>Your AI control center.</h1><span>Knowledge, workflows, research, and usage in one place.</span></section>
    <div className="studio-layout">
      <nav className="studio-nav">{features.map(([key,label,description]) => <button className={active === key ? 'active' : ''} onClick={() => setActive(key)} key={key}><strong>{label}</strong><small>{description}</small></button>)}</nav>
      <section className="studio-panel"><div className="studio-title"><p>WORKSPACE MODULE</p><h2>{title}</h2></div>
        {active === 'router' && <div><p className="studio-copy">Choose what Smart Router should optimize. This preference is passed when you launch a task.</p><div className="mode-grid">{[['quality','Maximum quality'],['balanced','Balanced'],['economy','Save credits'],['speed','Fastest answer']].map(([key,label]) => <button className={routerMode === key ? 'selected' : ''} onClick={() => { setRouterMode(key); localStorage.setItem('allmodelai_router_mode', key); }} key={key}><strong>{label}</strong><small>{key === 'quality' ? 'Best reasoning model' : key === 'economy' ? 'Lowest-cost capable model' : key === 'speed' ? 'Lowest latency' : 'Quality and cost together'}</small></button>)}</div><button className="primary-action" onClick={() => openChat(`Router mode: ${routerMode}. Help me with: `)}>Start with Smart Router</button></div>}
        {dataType && <><form className="studio-form" onSubmit={addItem}><input value={form.name} onChange={e => setForm({...form,name:e.target.value})} placeholder={active === 'memory' ? 'What should AI remember?' : active === 'prompt' ? 'Prompt title' : `${title.slice(0,-1)} name`} />{active !== 'memory' && <textarea value={form.content} onChange={e => setForm({...form,content:e.target.value})} placeholder={active === 'document' ? 'Paste document text or source code here' : active === 'project' ? 'Project description and knowledge' : 'Prompt text; use {{topic}} for variables'} />}{active === 'project' && <input value={form.instructions} onChange={e => setForm({...form,instructions:e.target.value})} placeholder="Instructions for AI in this project" />}<button>Add {title.slice(0,-1).toLowerCase()}</button></form><div className="item-list">{items.map(item => <article key={item.id}><div><strong>{item.name}</strong>{item.content && <p>{item.content.slice(0,240)}</p>}{item.instructions && <small>{item.instructions}</small>}</div><span>{active === 'prompt' && <button onClick={() => openChat(item.content)}>Use</button>}{active === 'document' && <button onClick={() => openChat(`Use this document as context and answer my question.\n\n[${item.name}]\n${item.content}\n\nQuestion: `)}>Ask</button>}<button className="danger" onClick={() => removeItem(item)}>Delete</button></span></article>)}{!items.length && <p className="empty-state">Nothing here yet. Create your first item above.</p>}</div></>}
        {active === 'tools' && <div className="tools-grid">{toolTemplates.map(([name,prompt]) => <button onClick={() => openChat(prompt)} key={name}><span>✦</span><strong>{name}</strong><small>Open a guided task in chat</small></button>)}</div>}
        {active === 'sources' && <div className="research-card"><span>◎</span><h3>Research with sources</h3><p>Smart Router selects a research-focused model and asks for inline citations, publication dates, and a source list.</p><button className="primary-action" onClick={() => openChat('Research this topic using reliable current sources. Include inline citations, publication dates, and a final source list:\n\n')}>Start research</button></div>}
        {active === 'analytics' && analytics && <div className="analytics-grid"><article><small>CONVERSATIONS</small><strong>{analytics.conversations}</strong></article><article><small>MESSAGES</small><strong>{analytics.messages}</strong></article><article><small>EST. TOKENS</small><strong>{analytics.estimatedTokens.toLocaleString()}</strong></article><article className="model-breakdown"><small>BY MODEL</small>{Object.entries(analytics.byModel).map(([model,count]) => <p key={model}><span>{model}</span><b>{count}</b></p>)}</article></div>}
        {active === 'branches' && <div className="item-list">{history.map(chat => <article key={chat.id}><div><strong>{chat.title}</strong><p>{chat.messages?.length || 0} messages · {chat.model}</p></div><button onClick={() => branch(chat)}>Create branch</button></article>)}{!history.length && <p className="empty-state">Create a conversation first, then branch it here.</p>}</div>}
      </section>
    </div>
  </main>;
}
