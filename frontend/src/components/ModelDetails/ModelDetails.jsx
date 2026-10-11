import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { dashboardModels } from '../../data/dashboardModels';
import { modelGuides } from '../../data/modelGuides';
import {
  isModelAccessible,
  statusKeyForSlug,
  subscriptionLabelForModel,
} from '../../data/modelCapabilitiesMeta';
import { promptGalleryForSlug } from '../../data/modelPromptGallery';
import { apiFetch } from '../../lib/api';
import '../Dashboard/Dashboard.css';
import '../Dashboard/DashboardNav.css';
import '../Dashboard/DashboardDarkViolet.css';
import '../Dashboard/DashboardLayout.css';
import './ModelDetails.css';
import './ModelDetailsDarkViolet.css';
import './ModelCode.css';
import './ModelGuideUnique.css';
import './ModelDetailPremium.css';
import ModelDetailHero from './ModelDetailHero';
import ModelDetailCapabilities from './ModelDetailCapabilities';
import ModelDetailDashboard from './ModelDetailDashboard';
import ModelDetailPromptGallery from './ModelDetailPromptGallery';
import ModelDetailCodePanel from './ModelDetailCodePanel';
import ModelDetailGuideSection from './ModelDetailGuideSection';

const versionNames = {
  'claude-opus-4.1': 'Claude Opus',
  'claude-sonnet-4.6': 'Claude Sonnet',
  'claude-haiku-4.5': 'Claude Haiku',
};

function resolveOperationalStatus(slug, modelStatus) {
  if (slug === 'smart' || slug === 'ai_python') return 'Available in AllModelAI';
  const key = statusKeyForSlug(slug);
  if (!key || !Object.keys(modelStatus || {}).length) return 'Unknown';
  const value = modelStatus[key];
  if (value === true) return 'Available';
  if (value === false) return 'Unavailable';
  return 'Unknown';
}

export default function ModelDetails() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  useOutletContext();
  const model = dashboardModels.find((item) => item.slug === slug);
  const [authError, setAuthError] = useState('');
  const [creditStatus, setCreditStatus] = useState(null);
  const [modelStatus, setModelStatus] = useState({});

  useEffect(() => {
    apiFetch('/api/status/models')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data?.models) setModelStatus(data.models);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    apiFetch('/api/credits')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (data) setCreditStatus(data); })
      .catch(() => {});
  }, []);

  const selectedVersion = versionNames[searchParams.get('version')];
  const versionLabel = selectedVersion || model?.name || '';
  const guideContent = model ? (modelGuides[model.slug] || modelGuides.smart) : null;
  const prompts = model ? promptGalleryForSlug(model.slug) : [];
  const accessible = model ? isModelAccessible(model.slug, creditStatus) : false;
  const subscriptionLabel = model ? subscriptionLabelForModel(model, creditStatus) : '';
  const operationalStatus = model ? resolveOperationalStatus(model.slug, modelStatus) : 'Unknown';
  const usageNote = creditStatus?.remainingRequests != null
    ? `${creditStatus.remainingRequests} requests remaining this period`
    : null;

  const compareHref = useMemo(
    () => `/arena?models=${encodeURIComponent(model?.slug || 'gpt')}`,
    [model?.slug],
  );

  const openChat = useCallback(() => {
    if (!model) return;
    if (!accessible) {
      setAuthError('This model is available with a subscription or in Developer mode.');
      return;
    }
    setAuthError('');
    navigate(`/chat?model=${encodeURIComponent(model.slug)}`);
  }, [accessible, model, navigate]);

  const tryGuidePrompt = useCallback((prompt) => {
    if (!model) return;
    if (!accessible) {
      setAuthError('This model is available with a subscription or in Developer mode.');
      return;
    }
    setAuthError('');
    navigate(`/chat?model=${encodeURIComponent(model.slug)}`, {
      state: { starterPrompt: prompt },
    });
  }, [accessible, model, navigate]);

  if (!model) {
    return (
      <main className="dashboard-page dashboard-violet model-page">
        <div className="dashboard-shell model-detail-shell">
          <section className="model-detail-not-found glass-panel">
            <p className="dashboard-eyebrow">Model not found</p>
            <h1>We couldn&apos;t find that model</h1>
            <p>The link may be outdated. Browse the model library to pick a supported provider.</p>
            <div className="model-detail-hero__actions">
              <Link to="/explore" className="model-action-primary model-detail-btn">Browse models</Link>
              <Link to="/dashboard" className="model-detail-btn model-detail-btn--secondary">Dashboard</Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="dashboard-page dashboard-violet model-page model-page--premium">
      <div className="dashboard-shell model-detail-shell">
        {authError ? (
          <p role="alert" className="model-auth-error">
            {authError}
          </p>
        ) : null}

        <div className="model-back-row">
          <Link to="/dashboard">← Back to models</Link>
          <Link to="/explore">Model explorer</Link>
        </div>

        <ModelDetailHero
          model={model}
          versionLabel={versionLabel}
          subscriptionLabel={subscriptionLabel}
          accessible={accessible}
          onStartChat={openChat}
          compareHref={compareHref}
        />

        <nav className="model-detail-subnav glass-panel" aria-label="On this page">
          <a href="#model-capabilities">Capabilities</a>
          <a href="#model-dashboard">Information</a>
          <a href="#model-prompts">Prompts</a>
          <a href="#model-code">API</a>
          <a href="#model-guide">Guide</a>
        </nav>

        <div className="model-detail-stack">
          <ModelDetailCapabilities slug={model.slug} strengths={model.strengths} />
          <ModelDetailDashboard
            model={model}
            operationalStatus={operationalStatus}
            subscriptionLabel={subscriptionLabel}
            usageNote={usageNote}
          />
          <ModelDetailPromptGallery
            slug={model.slug}
            prompts={prompts}
            accessible={accessible}
            onAccessDenied={() => setAuthError('This model is available with a subscription or in Developer mode.')}
          />
          <ModelDetailCodePanel
            modelName={model.name}
            codeJs={model.codeJs}
            codePy={model.codePy}
          />
          <ModelDetailGuideSection
            model={model}
            versionLabel={versionLabel}
            guideContent={guideContent}
            onTryGuidePrompt={tryGuidePrompt}
            accessible={accessible}
          />
        </div>
      </div>
    </main>
  );
}
