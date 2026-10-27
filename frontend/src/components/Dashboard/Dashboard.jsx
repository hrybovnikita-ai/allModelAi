import { apiFetch } from '../../lib/api';
import { deleteUserAccountAndSignOut } from '../../lib/clientAuthReset';
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { useSession } from '../Session/SessionProvider';
import { AUTH_STATUS } from '../../lib/authSessionStatus';
import { dashboardModels as models } from '../../data/dashboardModels';
import './Dashboard.css';
import './DashboardEnhancements.css';
import './DashboardNav.css';
import './DashboardFeatureCards.css';
import './DashboardDarkViolet.css';
import './DashboardLayout.css';
import './DashboardResponsive.css';
import './DashboardPremium.css';
import DashboardSidebar from './DashboardSidebar';
import { DASHBOARD_QUICK_ACTIONS } from './dashboardQuickActions';
import AccountDeleteModal from '../AccountDeleteModal';
import DashboardResources from './DashboardResources';
import AllModelAILogo from '../AllModelAILogo/AllModelAILogo';
import DashboardIcon, { QUICK_ACTION_ICON } from './DashboardIcons';
import EverydayCards from '../EverydayAI/EverydayCards';
import ManageSubscriptionModal from './ManageSubscriptionModal';
import { formatSubscriptionPlanLabel } from '../../lib/planLabels';
import { isCompleteCreditStatus, normalizeCreditStatus } from '../../lib/creditStatus';
import { normalizeModelStatusMap } from '../../data/ollamaCloudVariants';
import { resolveModelLibraryCardStatus } from '../../lib/modelLibraryStatus';
import {
  canUseChatModel,
  isPaidPlanAccess,
} from '../../lib/modelEntitlements';
import ProSubscribeButton from '../Subscribe/ProSubscribeButton';
import DashboardUsageChart from './DashboardUsageChart';
import './DashboardModelLibrary.css';

const modelMeta = { GPT: ['Fast', '128K context', '$'], Gemini: ['Fast', '1M context', '$'], Claude: ['Thoughtful', '200K context', '$$'], Llama: ['Flexible', '128K context', '$'] };

const DASHBOARD_CODE_SAMPLE = `const result = await allModelAI.chat({
  model: 'claude-sonnet',
  prompt: 'Create something great'
});

console.log(result.text);`;

const subscriptionStatusLabel = (creditStatus) => {
  const key = creditStatus?.subscriptionStatus;
  if (key === 'active') return 'Active';
  if (key === 'free') return 'Free';
  if (key === 'expired') return 'Expired';
  if (key === 'canceled') return 'Canceled';
  return creditStatus?.hasSubscription ? 'Active' : 'Free';
};

export default function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user: routeUser, sessionVerified, retrySession } = useOutletContext();
  const { user: sessionUser, status, connectionIssue, authLoading, refresh } = useSession();
  const user = routeUser?.email ? routeUser : sessionUser;
  const backendReady = sessionVerified && status === AUTH_STATUS.AUTHENTICATED;
  const sessionStillChecking = authLoading || status === AUTH_STATUS.CHECKING_SESSION;
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [creditStatus, setCreditStatus] = useState(null);
  const [subscriptionLoad, setSubscriptionLoad] = useState('idle');
  const [subscriptionError, setSubscriptionError] = useState('');
  const [analytics, setAnalytics] = useState(null);
  const [recentProjects, setRecentProjects] = useState([]);
  const [manageSubOpen, setManageSubOpen] = useState(false);
  const [modelStatus, setModelStatus] = useState({});
  const [modelHealth, setModelHealth] = useState({});
  const [analyticsLoad, setAnalyticsLoad] = useState('idle');

  const loadSubscription = useCallback(async () => {
    if (!user?.email) {
      setSubscriptionLoad('idle');
      return;
    }
    if (!backendReady) {
      if (sessionStillChecking) {
        setSubscriptionLoad('loading');
        setSubscriptionError('');
        return;
      }
      if (status === AUTH_STATUS.CONNECTION_ISSUE || status === AUTH_STATUS.ERROR) {
        setSubscriptionLoad('error');
        setSubscriptionError(connectionIssue?.message || 'Could not reach the server. Start the backend on port 5050 or retry.');
      }
      return;
    }
    setSubscriptionLoad('loading');
    setSubscriptionError('');
    try {
      let data = null;
      const subscriptionResponse = await apiFetch('/api/subscription', { skipAuthRedirect: true });
      if (subscriptionResponse.ok) {
        data = await subscriptionResponse.json();
      } else {
        console.warn('[Dashboard] GET /api/subscription failed', subscriptionResponse.status);
        if (subscriptionResponse.status === 401) {
          await refresh({ force: true, silent: true });
          throw new Error('Your session could not be verified. Please sign in again or retry.');
        }
        if (![404, 405].includes(subscriptionResponse.status)) {
          throw new Error('Subscription service is temporarily unavailable. Please retry.');
        }
        const creditsResponse = await apiFetch('/api/credits', { skipAuthRedirect: true });
        if (creditsResponse.ok) {
          data = await creditsResponse.json();
        } else {
          console.warn('[Dashboard] GET /api/credits failed', creditsResponse.status);
          if (creditsResponse.status === 401) await refresh({ force: true, silent: true });
          throw new Error(creditsResponse.status === 401
            ? 'Your session could not be verified. Please sign in again or retry.'
            : 'Could not load your credits. Please retry.');
        }
      }
      const normalized = normalizeCreditStatus(data);
      if (!isCompleteCreditStatus(normalized)) {
        throw new Error('Subscription API returned an incomplete response.');
      }
      setCreditStatus(normalized);
      setSubscriptionLoad('ready');
    } catch (error) {
      console.error('[Dashboard] subscription load error', error);
      setSubscriptionError(error.message || 'Could not load subscription.');
      setSubscriptionLoad('error');
    }
  }, [user?.email, backendReady, sessionStillChecking, status, connectionIssue?.message, refresh]);

  useEffect(() => {
    if (!user?.email || !backendReady) return;
    void loadSubscription();
  }, [user?.email, backendReady, location.state?.subscriptionActivated, loadSubscription]);
  useEffect(() => {
    if (!user?.email || !backendReady) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    setAnalyticsLoad('loading');
    Promise.all([
      apiFetch(`/api/analytics?email=${encodeURIComponent(user.email)}`, {
        skipAuthRedirect: true,
        signal: controller.signal,
      }).then((r) => (r.ok ? r.json() : null)),
      apiFetch(`/api/workspace?email=${encodeURIComponent(user.email)}&type=project`, {
        skipAuthRedirect: true,
        signal: controller.signal,
      }).then((r) => (r.ok ? r.json() : [])),
    ]).then(([stats, projects]) => {
      setAnalytics(stats);
      setRecentProjects(Array.isArray(projects) ? projects.slice(0, 3) : []);
      setAnalyticsLoad(stats ? 'ready' : 'empty');
    }).catch(() => {
      setAnalyticsLoad('error');
    }).finally(() => clearTimeout(timeout));
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [user?.email, backendReady]);

  useEffect(() => {
    if (!backendReady) return;
    apiFetch('/api/status/models', { skipAuthRedirect: true })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data?.models || data?.providers) {
          setModelStatus(normalizeModelStatusMap(data?.models || {}, data?.providers || {}));
          setModelHealth(data?.modelHealth && typeof data.modelHealth === 'object' ? data.modelHealth : {});
        }
      })
      .catch(() => {});
  }, [backendReady]);

  if (!user?.email) {
    return (
      <main className="dashboard-page auth-loading-skeleton" role="status" aria-live="polite">
        <div className="auth-loading-skeleton-bar" aria-hidden="true" />
        <p>Loading your workspace…</p>
      </main>
    );
  }

  const deleteAccount = async () => {
    setIsDeleting(true);
    setDeleteError('');
    try {
      const { deleted, message } = await deleteUserAccountAndSignOut(user?.email);
      setDeleteModalOpen(false);
      if (message) {
        try {
          sessionStorage.setItem('allmodelai_auth_notice', message);
        } catch {
          /* ignore */
        }
      }
      if (!deleted && message) {
        setDeleteError(message);
      }
      navigate('/', { replace: true });
    } catch (error) {
      setDeleteError(error?.message || 'Could not complete account deletion.');
      navigate('/', { replace: true });
    } finally {
      setIsDeleting(false);
    }
  };

  const isFreePlan = creditStatus
    && !creditStatus.isOwner
    && (creditStatus.subscriptionStatus === 'free' || !creditStatus.hasSubscription);

  const firstName = user.name?.split(' ')[0] || 'there';
  const topModels = analytics?.byModel
    ? Object.entries(analytics.byModel)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
    : [];

  return (
    <main className="dashboard-page dashboard-violet dashboard-page--premium">
      <DashboardSidebar />
      <div className="dashboard-layout-main">
      <div className="dashboard-shell dashboard-shell--enter">
      {location.state?.subscriptionActivated?.message && (
        <div className="dashboard-email-notice" role="status">{location.state.subscriptionActivated.message}</div>
      )}
      {location.state?.welcomeEmail?.sent && <div className="dashboard-email-notice" role="status">✓ Welcome email sent to {user?.email}</div>}
      {location.state?.welcomeEmail?.reason === 'delivery_failed' && <div className="dashboard-email-notice warning" role="status">Your account is ready, but the welcome email could not be delivered.</div>}
      {deleteError && !deleteModalOpen && <p role="alert">{deleteError}</p>}
      <section className="dashboard-hero dashboard-card-reveal" style={{ '--dash-delay': '40ms' }}>
        <div className="dashboard-hero-main">
          <div className="dashboard-hero-brand-lockup">
            <AllModelAILogo size={44} className="dashboard-hero-logo" textClassName="dashboard-hero-logo-text" />
          </div>
          <p className="dashboard-eyebrow">Signed in as {user.email}</p>
          <h1>
            Welcome back, <span className="dashboard-hero-name">{firstName}</span>
          </h1>
          <p className="dashboard-hero-lede">
            Your models, billing, and workspace are ready. Pick a quick action below or open Smart chat for the best model on each task.
          </p>
          <div className="dashboard-hero-cta">
            <Link to="/chat?model=smart" className="dashboard-action-primary">Open Smart chat</Link>
            <Link to="/explore" className="dashboard-action-secondary">Browse models</Link>
          </div>
        </div>
      </section>
      <section className="dashboard-quick-actions" aria-label="Quick actions">
        {DASHBOARD_QUICK_ACTIONS.map((action, index) => (
          <Link
            key={action.to}
            to={action.to}
            className="dashboard-quick-action dashboard-card-reveal"
            style={{ '--dash-delay': `${60 + index * 35}ms` }}
          >
            <span className="dashboard-quick-action-icon" aria-hidden="true">
              <DashboardIcon name={QUICK_ACTION_ICON[action.iconKey] || 'spark'} size={22} />
            </span>
            <strong>{action.label}</strong>
            <small>{action.description}</small>
          </Link>
        ))}
      </section>
      {user?.email && (
        <section
          className="dashboard-usage dashboard-subscription-card dashboard-card-reveal"
          style={{ '--dash-delay': '80ms' }}
          aria-busy={subscriptionLoad === 'loading'}
        >
          {subscriptionLoad === 'loading' && !creditStatus && (
            <div className="dashboard-subscription-loading" role="status">
              <div className="dashboard-skeleton-shimmer" style={{ width: '40%', marginBottom: 12 }} aria-hidden="true" />
              <p>Loading subscription…</p>
            </div>
          )}
          {subscriptionError && (
            <p className="dashboard-subscription-error" role="alert">
              {subscriptionError}{' '}
              <button
                type="button"
                className="dashboard-sub-retry"
                onClick={() => {
                  void (async () => {
                    if (typeof retrySession === 'function') await retrySession();
                    await loadSubscription();
                  })();
                }}
              >
                Retry
              </button>
            </p>
          )}
          {creditStatus && (
            <>
              <div className="dashboard-subscription-head">
                <div>
                  <span>Current plan</span>
                  <strong>{creditStatus.isOwner ? 'Owner' : formatSubscriptionPlanLabel(creditStatus)}</strong>
                </div>
                <div>
                  <span>{creditStatus.isOwner ? 'Usage' : 'Requests remaining'}</span>
                  <strong>{creditStatus.isOwner ? 'Unlimited' : Number(creditStatus.remaining).toLocaleString()}</strong>
                </div>
                <div>
                  <span>Subscription status</span>
                  <strong>{creditStatus.isOwner ? 'Owner' : subscriptionStatusLabel(creditStatus)}</strong>
                </div>
                {creditStatus.aiCredits?.enabled ? (
                  <div>
                    <span>AI credits</span>
                    <strong>{Number(creditStatus.aiCredits.balance ?? 0).toLocaleString()}</strong>
                  </div>
                ) : null}
                {!creditStatus.isOwner && creditStatus.expiresAtLabel && (
                  <div>
                    <span>Renews/Expires</span>
                    <strong>{creditStatus.expiresAtLabel}</strong>
                  </div>
                )}
              </div>
              {!creditStatus.isOwner && creditStatus.limit != null && (
                <div className="usage-track"><i style={{ width: `${Math.min((creditStatus.used / creditStatus.limit) * 100, 100)}%` }} /></div>
              )}
              <div className="dashboard-subscription-actions">
                {isFreePlan ? (
                  <ProSubscribeButton className="dashboard-subscribe-btn pro-subscribe-btn--compact" variant="violet">
                    Subscribe
                  </ProSubscribeButton>
                ) : null}
                <button type="button" className="dashboard-sub-manage" onClick={() => setManageSubOpen(true)}>Manage subscription</button>
                <Link to="/dashboard/orders">Order history</Link>
                {!isFreePlan ? (
                  <ProSubscribeButton className="pro-subscribe-btn--compact" variant="violet">
                    Upgrade plan
                  </ProSubscribeButton>
                ) : null}
                {creditStatus.aiCredits?.enabled ? <Link to="/credits">Buy AI credits</Link> : null}
              </div>
            </>
          )}
        </section>
      )}
      <section
        className="personal-overview dashboard-card-reveal"
        style={{ '--dash-delay': '120ms' }}
        aria-busy={analyticsLoad === 'loading'}
      >
        <div className="overview-heading">
          <div>
            <p className="dashboard-eyebrow">Analytics</p>
            <h2>Workspace overview</h2>
          </div>
          <Link to="/studio">Open analytics →</Link>
        </div>
        {analyticsLoad === 'loading' && !analytics ? (
          <div className="dashboard-analytics-skeleton" role="status">
            <div className="dashboard-skeleton-shimmer" style={{ width: '100%', height: 88 }} aria-hidden="true" />
            <p>Loading usage stats…</p>
          </div>
        ) : null}
        {analyticsLoad === 'error' ? (
          <p className="dashboard-analytics-empty" role="status">Usage stats are temporarily unavailable. Your chats and billing are unaffected.</p>
        ) : null}
        <div className="overview-grid">
          <article>
            <small>CONVERSATIONS</small>
            <strong>{analytics?.conversations ?? '—'}</strong>
            <span>Saved in your workspace</span>
          </article>
          <article>
            <small>MESSAGES</small>
            <strong>{analytics?.messages ?? '—'}</strong>
            <span>Across every AI model</span>
          </article>
          <article>
            <small>ESTIMATED TOKENS</small>
            <strong>{analytics ? (analytics.estimatedTokens ?? 0).toLocaleString() : '—'}</strong>
            <span>Processed in conversations</span>
          </article>
          <article>
            <small>EST. API SPEND</small>
            <strong>
              {analytics?.estimatedCost != null
                ? `$${Number(analytics.estimatedCost).toFixed(2)}`
                : '—'}
            </strong>
            <span>Heuristic from token volume and paid model mix</span>
          </article>
          <article className="overview-model-usage">
            <small>TOP MODELS</small>
            <strong>{topModels.length ? topModels.length : '—'}</strong>
            <span>
              {topModels.length
                ? topModels.map(([slug, count]) => `${slug} (${count})`).join(' · ')
                : 'Usage appears after your first chats'}
            </span>
          </article>
        </div>
        {analytics?.byModel ? (
          <DashboardUsageChart byModel={analytics.byModel} />
        ) : null}
        <div className="recent-projects">
          <div>
            <h3>Recent projects</h3>
            <Link to="/studio">View all</Link>
          </div>
          {recentProjects.length ? recentProjects.map((project) => (
            <Link to="/studio" key={project.id}>
              <span aria-hidden="true">▦</span>
              <div>
                <strong>{project.name}</strong>
                <small>{project.content?.slice(0, 70) || 'Ready for your next task'}</small>
              </div>
              <b aria-hidden="true">→</b>
            </Link>
          )) : (
            <div className="projects-empty">
              <span aria-hidden="true">✦</span>
              <p>No projects yet. Turn your next idea into a focused workspace.</p>
              <Link to="/studio">Create project</Link>
            </div>
          )}
        </div>
      </section>
      <EverydayCards />
      <section className="dashboard-feature-cards" aria-label="Workspace highlights">
        <article className="dashboard-feature-card dashboard-feature-card-skills">
          <span className="feature-card-icon"><DashboardIcon name="sparkles" size={20} /></span>
          <p className="dashboard-eyebrow">Skills</p>
          <h2>Make ideas move.</h2>
          <p>Write, code, research, and plan with focused AI skills built for your next task.</p>
          <Link to="/chat">Open prompt studio <b>→</b></Link>
        </article>
        <article className="dashboard-feature-card dashboard-feature-card-stickers">
          <span className="feature-card-icon"><DashboardIcon name="layers" size={20} /></span>
          <p className="dashboard-eyebrow">Stickers</p>
          <h2>Give every model a mood.</h2>
          <div className="dashboard-sticker-row"><span>Claude</span><span>Gemini</span><span>GPT</span><span>Llama</span></div>
          <p>Switch perspectives fast and find the right voice for every project.</p>
          <a href="#dashboard-models">Browse the library <b>→</b></a>
        </article>
        <article className="dashboard-feature-card dashboard-feature-card-pricing">
          <span className="feature-card-icon"><DashboardIcon name="spark" size={20} /></span>
          <p className="dashboard-eyebrow">Pricing</p>
          <h2>More room to create.</h2>
          <p>Start free, then unlock more credits when your experiments become real work.</p>
          <button onClick={() => navigate('/checkout?plan=pro')}>View plans <b>→</b></button>
        </article>
      </section>
      <section className="dashboard-models" id="dashboard-models">
        <div className="dashboard-section-title"><div><span>Model library</span><h2>Choose your intelligence</h2></div><p>Switch providers whenever your task changes.</p></div>
        <div className="dashboard-grid">
          {models.map((model) => {
            const providerStatus = resolveModelLibraryCardStatus(model.slug, modelStatus, modelHealth);
            const hasChatAccess = creditStatus
              ? canUseChatModel(creditStatus, model.slug)
              : model.slug === 'smart' || model.slug === 'anonin';
            const tierLabel = hasChatAccess
              ? (creditStatus && isPaidPlanAccess(creditStatus) ? 'Included' : 'Free')
              : 'Pro';
            const tierClass = hasChatAccess ? 'free' : 'pro';
            return (
              <div className="dashboard-model-card" key={model.name}>
                <article>
                  <div className="dashboard-model-card-top">
                    <span className="dashboard-model-logo">
                      <img src={model.image} alt="" width={32} height={32} loading="lazy" decoding="async" />
                    </span>
                    <div className="dashboard-model-heading">
                      <h3>{model.name}</h3>
                      <small>{model.provider}{model.priceLabel ? ` · ${model.priceLabel}` : ''}</small>
                    </div>
                    <span className={`dashboard-model-tier dashboard-model-tier--${tierClass}`}>
                      {tierLabel}
                    </span>
                  </div>
                  <p className="dashboard-model-note">{model.note}</p>
                  <div className="model-meta">
                    <span>{modelMeta[model.name]?.[0] || 'Available'}</span>
                    <span>{modelMeta[model.name]?.[1] || 'Unified API'}</span>
                    <i className={providerStatus.className || undefined}>{providerStatus.label}</i>
                  </div>
                  {hasChatAccess ? (
                    <Link className="model-open" to={`/models/${model.slug}`}>
                      Open model <b>→</b>
                    </Link>
                  ) : (
                    <ProSubscribeButton
                      returnModel={model.slug}
                      variant="violet"
                      className="model-open model-open--subscribe pro-subscribe-btn--pill"
                    >
                      Subscribe to unlock <b aria-hidden="true">→</b>
                    </ProSubscribeButton>
                  )}
                </article>
              </div>
            );
          })}
        </div>
      </section>
      <section className="dashboard-code-section">
        <div><span>One API for every model</span><h2>Start with a few lines of code.</h2><p>Choose a model card above to see its company, capabilities, and a ready-to-use example.</p><Link to="/models/claude">Read model guide →</Link></div>
        <div className="dashboard-code-block">
          <button
            type="button"
            className="dashboard-code-copy"
            onClick={() => {
              void navigator.clipboard?.writeText(DASHBOARD_CODE_SAMPLE);
            }}
          >
            Copy
          </button>
          <pre tabIndex={0}><code>{DASHBOARD_CODE_SAMPLE}</code></pre>
        </div>
      </section>
      <DashboardResources />
      </div>
      </div>
      {manageSubOpen && (
        <ManageSubscriptionModal
          onClose={() => setManageSubOpen(false)}
          onUpdated={(data) => { if (data) setCreditStatus(data); loadSubscription(); }}
        />
      )}
      {deleteModalOpen && <AccountDeleteModal onCancel={() => { setDeleteModalOpen(false); setDeleteError(''); }} onConfirm={deleteAccount} isDeleting={isDeleting} error={deleteError} />}
    </main>
  );
}
