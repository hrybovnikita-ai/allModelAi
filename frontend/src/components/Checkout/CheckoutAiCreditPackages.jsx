import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import PaymentButton from './PaymentButton';

export default function CheckoutAiCreditPackages({
  sessionReady,
  showTestBanner,
  testBannerText,
}) {
  const [packages, setPackages] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const packRes = await apiFetch('/api/credits/packages');
      if (packRes.ok) {
        const data = await packRes.json();
        setPackages(data.packages || []);
      }
      if (!sessionReady) return;
      const [walletRes, ledgerRes] = await Promise.all([
        apiFetch('/api/credits/wallet'),
        apiFetch('/api/credits/ledger?limit=20'),
      ]);
      if (walletRes.ok) setWallet(await walletRes.json());
      if (ledgerRes.ok) {
        const ledger = await ledgerRes.json();
        setPurchases(ledger.purchases || ledger.entries?.filter((e) => e.entryType === 'purchase') || []);
      }
    } catch (loadError) {
      setError(loadError.message || 'Could not load credit packages.');
    }
  }, [sessionReady]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    if (params.get('credits') !== 'success' || !sessionId || !sessionReady) return undefined;
    void (async () => {
      const verify = await apiFetch(`/api/payments/credit-session/${encodeURIComponent(sessionId)}`);
      const data = await verify.json().catch(() => ({}));
      if (data.credited) {
        setNotice('Credits added to your balance.');
      } else if (data.status === 'processing') {
        setNotice(data.message || 'Payment processing — credits arrive after webhook confirmation.');
      }
      await load();
    })();
    return undefined;
  }, [sessionReady, load]);

  useEffect(() => {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    if (params.get('credits') === 'cancel') {
      setNotice('Checkout cancelled. No charge was made.');
    }
  }, []);

  const buy = async (packageId) => {
    if (!sessionReady) {
      setError('Sign in to buy credits.');
      return;
    }
    setBusyId(packageId);
    setError('');
    try {
      const response = await apiFetch('/api/payments/credit-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || data.userMessage || 'Checkout failed.');
      if (data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
        return;
      }
      throw new Error('Stripe did not return a checkout URL.');
    } catch (checkoutError) {
      setError(checkoutError.message || 'Could not start Stripe Checkout.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <section className="checkout-ai-credits" aria-labelledby="checkout-ai-credits-heading">
      <div className="checkout-ai-credits__head">
        <p className="checkout-eyebrow">Prepaid balance</p>
        <h2 id="checkout-ai-credits-heading">Buy AI credits</h2>
        <p className="checkout-ai-credits__lead">
          One-time Stripe Checkout (TEST MODE). Credits are added only after verified payment webhooks — not from the success page alone.
        </p>
        {wallet?.enabled ? (
          <p className="checkout-ai-credits__balance">
            Available: <strong>{Number(wallet.balance || 0).toLocaleString()}</strong> credits
          </p>
        ) : null}
      </div>

      {showTestBanner && testBannerText ? (
        <p className="checkout-test-mode-banner checkout-test-mode-banner--inline" role="status">{testBannerText}</p>
      ) : null}
      {notice ? <p className="checkout-ai-credits__notice" role="status">{notice}</p> : null}
      {error ? <p className="checkout-error checkout-error--left" role="alert">{error}</p> : null}

      <div className="checkout-ai-credits__grid">
        {packages.map((pack) => (
          <article key={pack.id} className={`checkout-ai-credit-card checkout-ai-credit-card--${pack.id}`}>
            <h3>{pack.name}</h3>
            <p className="checkout-ai-credit-card__price">{pack.priceDisplay}</p>
            <p className="checkout-ai-credit-card__credits">{pack.creditsIncluded?.toLocaleString()} credits</p>
            <p className="checkout-ai-credit-card__fine">{pack.disclaimer}</p>
            <PaymentButton
              type="button"
              loading={busyId === pack.id}
              loadingLabel="Opening Stripe…"
              disabled={!sessionReady && busyId !== pack.id}
              onClick={() => { void buy(pack.id); }}
            >
              Buy credits
            </PaymentButton>
          </article>
        ))}
      </div>

      {sessionReady && purchases.length > 0 ? (
        <div className="checkout-ai-credits__history">
          <h3>Payment history</h3>
          <ul>
            {purchases.slice(0, 10).map((row) => (
              <li key={row.id || row.referenceId}>
                <span>{row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}</span>
                <span>{row.metadata?.packageId || row.entryType}</span>
                <span>+{row.amount?.toLocaleString()} credits</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
