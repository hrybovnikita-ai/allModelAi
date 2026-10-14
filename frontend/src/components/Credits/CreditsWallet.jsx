import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import { useSession } from '../Session/SessionProvider';
import { AUTH_STATUS } from '../../lib/authSessionStatus';
import '../Dashboard/DashboardDarkViolet.css';
import '../Dashboard/DashboardLayout.css';
import '../Dashboard/DashboardResponsive.css';
import './CreditsWallet.css';

function formatCredits(value) {
  if (value == null) return '—';
  return Number(value).toLocaleString();
}

function formatLedgerEntry(entry) {
  const sign = entry.amount >= 0 ? '+' : '';
  return `${sign}${entry.amount.toLocaleString()} credits`;
}

export default function CreditsWallet() {
  const { user, status } = useSession();
  const [searchParams] = useSearchParams();
  const [packages, setPackages] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [conditions, setConditions] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [checkoutBusy, setCheckoutBusy] = useState('');
  const [notice, setNotice] = useState('');

  const authed = status === AUTH_STATUS.AUTHENTICATED && user?.email;

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const packRes = await apiFetch('/api/credits/packages');
      const packData = await packRes.json();
      if (packRes.ok) {
        setPackages(packData.packages || []);
        setConditions(packData.conditions || null);
      }
      if (!authed) return;
      const [walletRes, ledgerRes] = await Promise.all([
        apiFetch('/api/credits/wallet'),
        apiFetch('/api/credits/ledger?limit=40'),
      ]);
      if (walletRes.ok) setWallet(await walletRes.json());
      if (ledgerRes.ok) {
        const ledgerData = await ledgerRes.json();
        setLedger(ledgerData.entries || []);
      }
    } catch (error) {
      setLoadError(error.message || 'Could not load credits.');
    }
  }, [authed]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    if (searchParams.get('success') === '1' && sessionId && authed) {
      void (async () => {
        const verify = await apiFetch(`/api/payments/credit-session/${encodeURIComponent(sessionId)}`);
        const body = await verify.json().catch(() => ({}));
        if (verify.ok) {
          setNotice(body.credited
            ? 'Credits were added to your balance.'
            : (body.message || 'Payment received — waiting for webhook confirmation.'));
          await load();
        }
      })();
    }
    if (searchParams.get('cancel') === '1') {
      setNotice('Checkout was cancelled. No charge was made.');
    }
  }, [searchParams, authed, load]);

  const balanceLabel = useMemo(() => {
    if (!wallet?.enabled) return 'Prepaid credits (enable AI_CREDITS_ENABLED on server)';
    return `${formatCredits(wallet.balance)} credits available`;
  }, [wallet]);

  const buyPack = async (packageId) => {
    setCheckoutBusy(packageId);
    setLoadError('');
    try {
      const response = await apiFetch('/api/payments/credit-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Checkout unavailable.');
      if (data.checkoutUrl) window.location.assign(data.checkoutUrl);
      else throw new Error('No checkout URL returned.');
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setCheckoutBusy('');
    }
  };

  return (
    <main className="dashboard-page dashboard-violet credits-wallet-page">
      <header className="credits-wallet-header">
        <div>
          <Link to="/dashboard" className="credits-back-link">← Dashboard</Link>
          <h1>AI credits</h1>
          <p className="credits-wallet-sub">{balanceLabel}</p>
        </div>
        {authed ? (
          <button type="button" className="credits-btn credits-btn-primary" onClick={() => buyPack('plus')}>
            Buy credits
          </button>
        ) : (
          <Link to="/login" className="credits-btn credits-btn-primary">Sign in to buy</Link>
        )}
      </header>

      {notice ? <p className="credits-notice" role="status">{notice}</p> : null}
      {loadError ? <p className="credits-purchase-error" role="alert">{loadError}</p> : null}

      <section className="credits-packages-grid" aria-label="Credit packages">
        {packages.map((pack) => (
          <article key={pack.id} className={`credits-package-card credits-package-${pack.id}`}>
            <h2>{pack.name}</h2>
            <p className="credits-package-price">{pack.priceDisplay}</p>
            <p className="credits-package-credits">{formatCredits(pack.creditsIncluded)} credits</p>
            <ul className="credits-package-meta">
              <li>Example API cost basis: ${((pack.apiCostBasisUsdCents || 0) / 100).toFixed(2)}</li>
              <li>Est. Stripe fee (example): ${((pack.estimatedStripeFeeUsdCents || 0) / 100).toFixed(2)}</li>
            </ul>
            <p className="credits-package-disclaimer">{pack.disclaimer}</p>
            <button
              type="button"
              className="credits-btn credits-btn-secondary credits-package-buy"
              disabled={!authed || checkoutBusy === pack.id}
              onClick={() => buyPack(pack.id)}
            >
              {checkoutBusy === pack.id ? 'Redirecting…' : 'Buy with Stripe'}
            </button>
          </article>
        ))}
      </section>

      {conditions ? (
        <section className="credits-conditions">
          <h3>Pricing & conditions</h3>
          <ul>
            <li>One-time payments only — no automatic card charges.</li>
            <li>User credits are separate from upstream AI provider quotas.</li>
            <li>Failed AI requests are not charged.</li>
            <li>Stripe TEST MODE until you enable live checkout on the server.</li>
            <li>{packages[0]?.prepaidEligibilityNote || 'Confirm prepaid AI credit eligibility with Stripe before production.'}</li>
          </ul>
        </section>
      ) : null}

      {authed ? (
        <section className="credits-ledger-section">
          <h3>Usage history</h3>
          {ledger.length === 0 ? (
            <p className="credits-wallet-sub">No credit transactions yet.</p>
          ) : (
            <ul className="credits-ledger-list">
              {ledger.map((entry) => (
                <li key={entry.id || entry.referenceId}>
                  <span>{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : '—'}</span>
                  <span className="credits-ledger-type">{entry.entryType}</span>
                  <span className={entry.amount >= 0 ? 'credits-ledger-plus' : 'credits-ledger-minus'}>
                    {formatLedgerEntry(entry)}
                  </span>
                  <span>{formatCredits(entry.balanceAfter)} after</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </main>
  );
}
