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

  useEffect(() => {
    if (user) return undefined;
    fetch('/api/auth/session', { credentials: 'include' })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (data?.user) { setUser(data.user); sessionStorage.setItem('allmodelai_user', JSON.stringify(data.user)); } })
      .finally(() => setCheckingSession(false));
  }, [user]);
  useEffect(() => { fetch('/api/status/models').then((response) => response.ok ? response.json() : null).then((data) => data && setModelStatus(data.models)).catch(() => {}); }, []);
  useEffect(() => { if (user?.email) fetch(`/api/credits?email=${encodeURIComponent(user.email)}`).then((response) => response.ok ? response.json() : null).then((data) => data && setCreditStatus(data)).catch(() => {}); }, [user?.email]);

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
        <div className="dashboard-nav-links"><Link to="/chat">Chat</Link><Link to="/studio">Workspace Studio</Link><a href="#dashboard-models">Models</a><Link to="/models/gpt#model-code">API Docs</Link></div>
        <div className="dashboard-user"><span>{user.name?.charAt(0) || user.email.charAt(0)}</span><Link to="/settings"><small>{user.name || user.email}</small></Link><button onClick={() => setDeleteModalOpen(true)}>Sign out</button></div>
      </nav>
      <section className="dashboard-hero">
        <div>
          <p className="dashboard-eyebrow">Workspace ready</p>
          <h1>Welcome, {user.name?.split(' ')[0] || 'creator'}.</h1>
          <p>Your account is connected to the backend. Choose a model and start building something remarkable.</p>
          <div className="dashboard-actions"><a href="#dashboard-models">Explore models</a><Link to="/#pricing">View pricing</Link></div>
        </div>
        <div className="dashboard-orbit" aria-hidden="true"><span>AI</span></div>
      </section>
      {creditStatus && <section className="dashboard-usage"><div><span>Usage this month</span><strong>{creditStatus.plan} plan · {creditStatus.remaining} requests left</strong></div><div className="usage-track"><i style={{ width: `${Math.min((creditStatus.used / creditStatus.limit) * 100, 100)}%` }} /></div><Link to="/#pricing">Upgrade plan</Link></section>}
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
          {models.map((model) => { const statusKey = model.slug === 'gemini' ? 'gemini' : model.slug === 'claude' ? 'claude' : model.slug === 'gpt' ? 'gpt' : 'others'; const online = modelStatus[statusKey] !== false; return <Link className="dashboard-model-card" to={`/models/${model.slug}`} key={model.name}><article><img src={model.image} alt={`${model.name} logo`} /><small>{model.provider}</small><h3>{model.name}</h3><p>{model.note}</p><div className="model-meta"><span>{modelMeta[model.name]?.[0] || 'Available'}</span><span>{modelMeta[model.name]?.[1] || 'Unified API'}</span><i className={online ? '' : 'offline'}>{online ? 'Online' : 'Offline'}</i></div><span className="model-open">Open {model.name} <b>→</b></span></article></Link>; })}
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
