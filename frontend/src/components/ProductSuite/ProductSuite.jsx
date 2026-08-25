import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import './ProductSuite.css';

const features = [
  ['verify', 'Email verification', 'Security', 'Confirm new accounts through a protected email link.', '/settings', '01', 'Protected'],
  ['recovery', 'Password recovery', 'Security', 'Recover access through a time-limited reset flow.', '/forgot-password', '02', 'Ready'],
  ['two-factor', 'Two-factor security', 'Security', 'Add a second verification step to sensitive account actions.', '/settings', '03', 'Protected'],
  ['profile', 'Personal profile', 'Workspace', 'Manage your identity, language, appearance, and response preferences.', '/settings', '04', 'Ready'],
  ['history', 'Cloud chat history', 'Workspace', 'Search, rename, branch, organize, and continue saved conversations.', '/chat', '05', 'Live'],
  ['arena', 'Multi-model Arena', 'AI tools', 'Send one task to several models and compare their approaches.', '/arena', '06', 'Live'],
  ['router', 'Smart Router', 'AI tools', 'Automatically choose the strongest model for every task.', '/chat?model=smart', '07', 'Live'],
  ['files', 'Files and documents', 'AI tools', 'Work with documents, code, tables, screenshots, and project context.', '/control-center?feature=files', '08', 'Ready'],
  ['voice', 'Voice mode', 'AI tools', 'Dictate prompts naturally and work in your browser language.', '/chat', '09', 'Ready'],
  ['images', 'Image studio', 'Creation', 'Generate original visual concepts directly from a conversation.', '/chat?skill=image', '10', 'Connected'],
  ['prompts', 'Prompt library', 'Creation', 'Save reusable prompts and launch proven templates in one click.', '/studio?tab=prompt', '11', 'Ready'],
  ['assistants', 'Personal assistants', 'Creation', 'Build specialists with custom instructions, knowledge, and tone.', '/studio?tab=assistant', '12', 'Ready'],
  ['teams', 'Team workspaces', 'Collaboration', 'Invite collaborators and organize shared project responsibilities.', '/innovation-hub?feature=teams', '13', 'Workspace'],
  ['sharing', 'Secure sharing', 'Collaboration', 'Prepare read-only conversation links for clients and teammates.', '/control-center?feature=share', '14', 'Ready'],
  ['export', 'Export center', 'Collaboration', 'Download conversations as PDF, Word, Markdown, text, or JSON.', '/control-center?feature=export', '15', 'Ready'],
  ['notifications', 'Smart notifications', 'Workspace', 'Receive completion, provider recovery, and usage alerts.', '/control-center?feature=notify', '16', 'Ready'],
  ['analytics', 'Usage analytics', 'Business', 'Understand messages, tokens, model usage, and estimated costs.', '/studio?tab=analytics', '17', 'Live'],
  ['billing', 'Subscription billing', 'Business', 'Choose a plan in a production-style secure checkout flow.', '/checkout?plan=pro', '18', 'Prepared'],
  ['admin', 'Admin console', 'Business', 'Monitor accounts, sessions, subscriptions, and platform health.', '/admin', '19', 'Protected'],
  ['feedback', 'Response feedback', 'AI tools', 'Rate answers and help improve future model routing decisions.', '/chat', '20', 'Live'],
];

export default function ProductSuite() {
  const navigate = useNavigate();
  const saved = sessionStorage.getItem('allmodelai_user');
  const user = saved ? JSON.parse(saved) : null;
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const categories = ['All', ...new Set(features.map((feature) => feature[2]))];
  const visible = useMemo(() => features.filter((feature) => (category === 'All' || feature[2] === category) && `${feature[1]} ${feature[2]} ${feature[3]}`.toLowerCase().includes(query.toLowerCase())), [category, query]);

  if (!user) return <Navigate to="/" replace />;

  return <main className="suite-page">
    <header className="suite-header"><Link to="/dashboard" className="suite-brand"><span>AI</span>AllModelAI</Link><nav><Link to="/chat">Chat</Link><Link to="/studio">Studio</Link><Link to="/dashboard">Dashboard</Link></nav></header>
    <section className="suite-hero"><div><p>COMPLETE AI WORKSPACE</p><h1>One application.<br/><span>20 powerful tools.</span></h1><small>Everything you need to create, compare, collaborate, and manage AI work from one secure place.</small></div><div className="suite-score"><strong>20</strong><span>connected modules</span><i><b/></i><small>Product workspace ready</small></div></section>
    <section className="suite-toolbar"><div>{categories.map((item) => <button key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div><label><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a feature..." /></label></section>
    <section className="suite-grid">{visible.map(([key, title, group, description, route, number, status]) => <article key={key}><div><i>{number}</i><span>{status}</span></div><small>{group}</small><h2>{title}</h2><p>{description}</p><button onClick={() => navigate(route)}>Open module <b>→</b></button></article>)}</section>
    {!visible.length && <div className="suite-empty"><strong>No modules found</strong><span>Try a different feature name or category.</span></div>}
  </main>;
}
