import { apiFetch } from '../../lib/api';
import { clearAllSessionData } from '../../lib/session';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { dashboardModels as models } from '../../data/dashboardModels';
import './Dashboard.css';
import './DashboardEnhancements.css';
import './DashboardNav.css';
import './DashboardFeatureCards.css';
import './DashboardDarkViolet.css';
import './DashboardLayout.css';
import {
  DASHBOARD_NAV_DESKTOP_MAIN,
  DASHBOARD_NAV_DESKTOP_MORE,
  DASHBOARD_NAV_LINKS,
} from './dashboardNavLinks';
import AccountDeleteModal from '../AccountDeleteModal';
import DashboardResources from './DashboardResources';
import { AllModelAILogoMark } from '../AllModelAILogo/AllModelAILogo';
import EverydayCards from '../EverydayAI/EverydayCards';
const modelMeta = { GPT: ['Fast', '128K context', '$'], Gemini: ['Fast', '1M context', '$'], Claude: ['Thoughtful', '200K context', '$$'], Llama: ['Flexible', '128K context', '$'] };

export default function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useOutletContext();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [creditStatus, setCreditStatus] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [recentProjects, setRecentProjects] = useState([]);

  useEffect(() => { if (user?.email) apiFetch(`/api/credits?email=${encodeURIComponent(user.email)}`).then((response) => response.ok ? response.json() : null).then((data) => data && setCreditStatus(data)).catch(() => {}); }, [user?.email]);
  useEffect(() => { if (!user?.email) return; Promise.all([apiFetch(`/api/analytics?email=${encodeURIComponent(user.email)}`).then(r => r.ok ? r.json() : null), apiFetch(`/api/workspace?email=${encodeURIComponent(user.email)}&type=project`).then(r => r.ok ? r.json() : [])]).then(([stats, projects]) => { setAnalytics(stats); setRecentProjects(projects.slice(0, 3)); }).catch(() => {}); }, [user?.email]);


  const deleteAccount = async () => {
    setIsDeleting(true);
    setDeleteError('');
    try {
      const response = await apiFetch('/api/auth/account', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Could not delete your account.');
      clearAllSessionData();
      navigate('/');
    } catch (error) {
      setDeleteError(error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <main className="dashboard-page dashboard-violet">
      <header className="dashboard-header dashboard-nav">
        <div className="dashboard-nav-bar">
          <div className="header-brand dashboard-nav-left">
            <Link to="/" className="dashboard-brand"><AllModelAILogoMark />AllModelAI</Link>
          </div>
          <nav className="header-nav dashboard-nav-center" aria-label="Workspace navigation">
            <div className="dashboard-nav-links">
              {DASHBOARD_NAV_DESKTOP_MAIN.map((item) => (
                <Link key={item.to} to={item.to}>
                  {item.label}
                </Link>
              ))}
            </div>
            <details className="dashboard-nav-more-desktop">
              <summary>More</summary>
              <div className="dashboard-nav-more-desktop-panel" role="menu">
                {DASHBOARD_NAV_DESKTOP_MORE.map((item) => (
                  <Link key={item.to} to={item.to} role="menuitem">
                    {item.label}
                  </Link>
                ))}
              </div>
            </details>
          </nav>
          <div className="header-account dashboard-nav-right">
            <details className="dashboard-nav-mobile">
              <summary>Menu</summary>
              <div className="dashboard-nav-mobile-panel" role="menu">
                {DASHBOARD_NAV_LINKS.map((item) => (
                  <Link key={item.to} to={item.to} role="menuitem">
                    {item.label}
                  </Link>
                ))}
              </div>
            </details>
            <div className="dashboard-user"><span>{user.avatar ? <img src={user.avatar} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} /> : user.name?.charAt(0) || user.email.charAt(0)}</span><Link to="/settings"><small>{user.name || user.email}</small></Link><button onClick={async () => { try { const response = await apiFetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); if (!response.ok) throw new Error('Could not sign out. Try again.'); clearAllSessionData(); navigate('/login', { replace: true }); } catch (error) { setDeleteError(error.message); } }}>Sign out</button><button onClick={() => setDeleteModalOpen(true)}>Delete account</button></div>
          </div>
        </div>
      </header>
      <div className="dashboard-shell">
      {location.state?.welcomeEmail?.sent && <div className="dashboard-email-notice" role="status">✓ Welcome email sent to {user.email}</div>}
      {location.state?.welcomeEmail?.reason === 'delivery_failed' && <div className="dashboard-email-notice warning" role="status">Your account is ready, but the welcome email could not be delivered.</div>}
      {deleteError && !deleteModalOpen && <p role="alert">{deleteError}</p>}
      <section className="dashboard-hero">
        <div>
          <p className="dashboard-eyebrow">Workspace ready</p>
          <h1>Welcome, {user.name?.split(' ')[0] || 'creator'}.</h1>
          <p>Your account is connected to the backend. Choose a model and start building something remarkable.</p>
          <div className="dashboard-actions">
            <Link to="/chat?model=smart" className="dashboard-action-primary">Open Smart chat</Link>
            <Link to="/next-12">Reliability tools</Link>
            <Link to="/builder-25">Developer Toolkit</Link>
            <Link to="/next-25">AI Workflows</Link>
            <Link to="/next-9">Research</Link>
            <Link to="/production">Production</Link>
            <Link to="/skills-hub">Skills Hub</Link>
          </div>
        </div>
        <div className="dashboard-orbit" aria-hidden="true"><AllModelAILogoMark /></div>
      </section>
      {creditStatus && <section className="dashboard-usage"><div><span>Usage this month</span><strong>{creditStatus.plan} plan · {creditStatus.remaining} requests left</strong></div><div className="usage-track"><i style={{ width: `${Math.min((creditStatus.used / creditStatus.limit) * 100, 100)}%` }} /></div><Link to="/checkout?plan=pro">Upgrade plan</Link></section>}
      <section className="personal-overview"><div className="overview-heading"><div><p className="dashboard-eyebrow">Your week</p><h2>Workspace overview</h2></div><Link to="/studio">Open analytics →</Link></div><div className="overview-grid"><article><small>CONVERSATIONS</small><strong>{analytics?.conversations ?? '—'}</strong><span>Saved in your workspace</span></article><article><small>MESSAGES</small><strong>{analytics?.messages ?? '—'}</strong><span>Across every AI model</span></article><article><small>ESTIMATED TOKENS</small><strong>{analytics ? (analytics.estimatedTokens ?? 0).toLocaleString() : '—'}</strong><span>Processed in conversations</span></article><article className="continue-card"><small>QUICK START</small><strong>Continue creating</strong><div><Link to="/chat?model=smart">Smart chat</Link><Link to="/arena">AI Arena</Link></div></article></div><div className="recent-projects"><div><h3>Recent projects</h3><Link to="/studio">View all</Link></div>{recentProjects.length ? recentProjects.map(project => <Link to="/studio" key={project.id}><span>▦</span><div><strong>{project.name}</strong><small>{project.content?.slice(0, 70) || 'Ready for your next task'}</small></div><b>→</b></Link>) : <div className="projects-empty"><span>✦</span><p>No projects yet. Turn your next idea into a focused workspace.</p><Link to="/studio">Create project</Link></div>}</div></section>
      <EverydayCards />
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
          {models.map((model) => <Link className="dashboard-model-card" to={`/models/${model.slug}`} key={model.name}><article><img src={model.image} alt={`${model.name} logo`} /><small>{model.provider} · {model.priceLabel||'Premium'}</small><h3>{model.name}</h3><p>{model.note}</p><div className="model-meta"><span>{modelMeta[model.name]?.[0] || 'Available'}</span><span>{modelMeta[model.name]?.[1] || 'Unified API'}</span><i>Online</i></div><span className="model-open">Open {model.name} <b>→</b></span></article></Link>)}
        </div>
      </section>
      <section className="dashboard-code-section">
        <div><span>One API for every model</span><h2>Start with a few lines of code.</h2><p>Choose a model card above to see its company, capabilities, and a ready-to-use example.</p><Link to="/models/claude">Read model guide →</Link></div>
        <pre><code>{`const result = await allModelAI.chat({\n  model: 'claude-sonnet',\n  prompt: 'Create something great'\n});\n\nconsole.log(result.text);`}</code></pre>
      </section>
      <DashboardResources />
      </div>
      {deleteModalOpen && <AccountDeleteModal onCancel={() => { setDeleteModalOpen(false); setDeleteError(''); }} onConfirm={deleteAccount} isDeleting={isDeleting} error={deleteError} />}
    </main>
  );
}
