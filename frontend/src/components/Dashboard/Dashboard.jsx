import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { dashboardModels as models } from '../../data/dashboardModels';
import './Dashboard.css';
import './DashboardEnhancements.css';
import './DashboardNav.css';
import './DashboardFeatureCards.css';
import AccountDeleteModal from '../AccountDeleteModal';
const modelMeta = { GPT: ['Fast', '128K context', '$'], Gemini: ['Fast', '1M context', '$'], Claude: ['Thoughtful', '200K context', '$$'], Llama: ['Flexible', '128K context', '$'] };

export default function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const saved = sessionStorage.getItem('allmodelai_user');
  const [user, setUser] = useState(location.state?.user || (saved ? JSON.parse(saved) : null));
  const [checkingSession, setCheckingSession] = useState(!user);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [modelStatus, setModelStatus] = useState({});
  const [creditStatus, setCreditStatus] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [recentProjects, setRecentProjects] = useState([]);

  useEffect(() => {
    if (user) return undefined;
    fetch('/api/auth/session', { credentials: 'include' })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (data?.user) { setUser(data.user); sessionStorage.setItem('allmodelai_user', JSON.stringify(data.user)); } })
      .finally(() => setCheckingSession(false));
  }, [user]);
  useEffect(() => { fetch('/api/status/models').then((response) => response.ok ? response.json() : null).then((data) => data && setModelStatus(data.models)).catch(() => {}); }, []);
  useEffect(() => { if (user?.email) fetch(`/api/credits?email=${encodeURIComponent(user.email)}`).then((response) => response.ok ? response.json() : null).then((data) => data && setCreditStatus(data)).catch(() => {}); }, [user?.email]);
  useEffect(() => { if (!user?.email) return; Promise.all([fetch(`/api/analytics?email=${encodeURIComponent(user.email)}`).then(r => r.ok ? r.json() : null), fetch(`/api/workspace?email=${encodeURIComponent(user.email)}&type=project`).then(r => r.ok ? r.json() : [])]).then(([stats, projects]) => { setAnalytics(stats); setRecentProjects(projects.slice(0, 3)); }).catch(() => {}); }, [user?.email]);

  if (checkingSession) return <main className="dashboard-page"><p>Restoring your workspace...</p></main>;
  if (!user) return <Navigate to="/" replace />;

  const deleteAccount = async () => {
    setIsDeleting(true);
    setDeleteError('');
    try {
      const response = await fetch('/api/auth/account', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Could not delete your account.');
      sessionStorage.removeItem('allmodelai_user');
      navigate('/');
    } catch (error) {
      setDeleteError(error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <main className="dashboard-page">
      <nav className="dashboard-nav">
        <Link to="/" className="dashboard-brand"><span>AI</span>AllModelAI</Link>
        <div className="dashboard-nav-links"><Link to="/chat">Chat</Link><Link to="/builder-25">Builder 25</Link><Link to="/next-20">Next 20</Link><Link to="/next-25">Next 25</Link><Link to="/next-9">Next 9</Link><Link to="/next-10">Next 10</Link><Link to="/ai-platform">AI Platform</Link><Link to="/website-builder">Website Builder</Link><Link to="/arena">Arena</Link><Link to="/explore">Models</Link><Link to="/studio">Studio</Link><Link to="/ai-tools">Power Lab</Link><Link to="/creator-tools">Creator Lab</Link><Link to="/features">Features</Link><Link to="/control-center">Control</Link></div>
        <div className="dashboard-user"><span>{user.name?.charAt(0) || user.email.charAt(0)}</span><Link to="/settings"><small>{user.name || user.email}</small></Link><button onClick={() => setDeleteModalOpen(true)}>Sign out</button></div>
      </nav>
      {location.state?.welcomeEmail?.sent && <div className="dashboard-email-notice" role="status">✓ Welcome email sent to {user.email}</div>}
      {location.state?.welcomeEmail?.reason === 'delivery_failed' && <div className="dashboard-email-notice warning" role="status">Your account is ready, but the welcome email could not be delivered.</div>}
      <section className="dashboard-hero">
        <div>
          <p className="dashboard-eyebrow">Workspace ready</p>
          <h1>Welcome, {user.name?.split(' ')[0] || 'creator'}.</h1>
          <p>Your account is connected to the backend. Choose a model and start building something remarkable.</p>
          <div className="dashboard-actions"><Link to="/next-12">Explore 12 reliability tools</Link></div>
        <div className="dashboard-actions"><Link to="/next-15">Explore Next 15</Link><Link to="/next-30">Explore Next 30</Link><Link to="/app-20">Explore App 20</Link><Link to="/next-20">Explore 20 new powers</Link><Link to="/power-center">Open Power Center</Link><Link to="/builder-25">Open Builder 25</Link><Link to="/next-25">Explore 25 capabilities</Link><Link to="/next-9">Explore 9 new ideas</Link><Link to="/next-10">Explore 10 new tools</Link><Link to="/production">Production Center</Link><Link to="/skills-hub">Skills Hub</Link><Link to="/expansion-hub">Expansion Hub</Link></div>
        </div>
        <div className="dashboard-orbit" aria-hidden="true"><span>AI</span></div>
      </section>
      {creditStatus && <section className="dashboard-usage"><div><span>Usage this month</span><strong>{creditStatus.plan} plan · {creditStatus.remaining} requests left</strong></div><div className="usage-track"><i style={{ width: `${Math.min((creditStatus.used / creditStatus.limit) * 100, 100)}%` }} /></div><Link to="/checkout?plan=pro">Upgrade plan</Link></section>}
      <section className="personal-overview"><div className="overview-heading"><div><p className="dashboard-eyebrow">Your week</p><h2>Workspace overview</h2></div><Link to="/studio">Open analytics →</Link></div><div className="overview-grid"><article><small>CONVERSATIONS</small><strong>{analytics?.conversations ?? '—'}</strong><span>Saved in your workspace</span></article><article><small>MESSAGES</small><strong>{analytics?.messages ?? '—'}</strong><span>Across every AI model</span></article><article><small>ESTIMATED TOKENS</small><strong>{analytics ? analytics.estimatedTokens.toLocaleString() : '—'}</strong><span>Processed in conversations</span></article><article className="continue-card"><small>QUICK START</small><strong>Continue creating</strong><div><Link to="/chat?model=smart">Smart chat</Link><Link to="/arena">AI Arena</Link></div></article></div><div className="recent-projects"><div><h3>Recent projects</h3><Link to="/studio">View all</Link></div>{recentProjects.length ? recentProjects.map(project => <Link to="/studio" key={project.id}><span>▦</span><div><strong>{project.name}</strong><small>{project.content?.slice(0, 70) || 'Ready for your next task'}</small></div><b>→</b></Link>) : <div className="projects-empty"><span>✦</span><p>No projects yet. Turn your next idea into a focused workspace.</p><Link to="/studio">Create project</Link></div>}</div></section>
      <section className="dashboard-feature-cards" aria-label="Workspace highlights">
        <article className="dashboard-feature-card dashboard-feature-card-skills">
          <span className="feature-card-icon">✦</span>
          <p className="dashboard-eyebrow">Skills</p>
          <h2>Make ideas move.</h2>
          <p>Write, code, research, and plan with focused AI skills built for your next task.</p>
          <Link to="/chat">Open prompt studio <b>→</b></Link>
        </article>
        <article className="dashboard-feature-card dashboard-feature-card-stickers">
          <span className="feature-card-icon">◇</span>
          <p className="dashboard-eyebrow">Stickers</p>
          <h2>Give every model a mood.</h2>
          <div className="dashboard-sticker-row"><span>Claude</span><span>Gemini</span><span>GPT</span><span>Llama</span></div>
          <p>Switch perspectives fast and find the right voice for every project.</p>
          <a href="#dashboard-models">Browse the library <b>→</b></a>
        </article>
        <article className="dashboard-feature-card dashboard-feature-card-pricing">
          <span className="feature-card-icon">＋</span>
          <p className="dashboard-eyebrow">Pricing</p>
          <h2>More room to create.</h2>
          <p>Start free, then unlock more credits when your experiments become real work.</p>
          <button onClick={() => navigate('/checkout?plan=pro')}>View plans <b>→</b></button>
        </article>
      </section>
      <section className="dashboard-models" id="dashboard-models">
        <div className="dashboard-section-title"><div><span>Model library</span><h2>Choose your intelligence</h2></div><p>Switch providers whenever your task changes.</p></div>
        <div className="dashboard-grid">
          {models.map((model) => { const statusKey = ['gemini','claude','gpt','cloudflare'].includes(model.slug) ? model.slug : 'others'; const online = modelStatus[statusKey] !== false; return <Link className="dashboard-model-card" to={`/models/${model.slug}`} key={model.name}><article><img src={model.image} alt={`${model.name} logo`} /><small>{model.provider} · {model.priceLabel||'Premium'}</small><h3>{model.name}</h3><p>{model.note}</p><div className="model-meta"><span>{modelMeta[model.name]?.[0] || 'Available'}</span><span>{modelMeta[model.name]?.[1] || 'Unified API'}</span><i className={online ? '' : 'offline'}>{online ? 'Online' : 'Offline'}</i></div><span className="model-open">Open {model.name} <b>→</b></span></article></Link>; })}
        </div>
      </section>
      <section className="dashboard-code-section">
        <div><span>One API for every model</span><h2>Start with a few lines of code.</h2><p>Choose a model card above to see its company, capabilities, and a ready-to-use example.</p><Link to="/models/claude">Read model guide →</Link></div>
        <pre><code>{`const result = await allModelAI.chat({\n  model: 'claude-sonnet',\n  prompt: 'Create something great'\n});\n\nconsole.log(result.text);`}</code></pre>
      </section>
      {deleteModalOpen && <AccountDeleteModal onCancel={() => { setDeleteModalOpen(false); setDeleteError(''); }} onConfirm={deleteAccount} isDeleting={isDeleting} error={deleteError} />}
    </main>
  );
}
