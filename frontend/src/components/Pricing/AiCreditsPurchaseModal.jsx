import { useEffect, useState } from 'react';
import { resolveApiUrl } from '../../lib/apiBase';
import { fetchCheckoutInfo, TEST_MODE_BANNER } from '../../lib/paymentCheckoutInfo';

export default function AiCreditsPurchaseModal({ open, onClose }) {
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState([]);
  const [notice, setNotice] = useState('');
  const [selectedId, setSelectedId] = useState('starter');
  const [checkoutAvailable, setCheckoutAvailable] = useState(false);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState('');
  const [testModeText, setTestModeText] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    setTestModeText('');
    Promise.all([
      fetch(resolveApiUrl('/api/credits/packages'), { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : null)),
      fetchCheckoutInfo().catch(() => null),
    ])
      .then(([data, checkoutInfo]) => {
        if (cancelled) return;
        setPackages(Array.isArray(data?.packages) ? data.packages : []);
        setCheckoutAvailable(Boolean(data?.checkoutAvailable));
        setNotice(
          data?.checkoutUnavailableMessage
            || data?.creem?.userMessage
            || 'Real checkout is not yet available. Merchant approval is pending.',
        );
        if (checkoutInfo?.showTestModeBanner) {
          setTestModeText(checkoutInfo?.testModeBannerText || TEST_MODE_BANNER);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPackages([]);
          setCheckoutAvailable(false);
          setNotice('Could not load credit packages. Try again later.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const selected = packages.find((p) => p.id === selectedId) || packages[0];

  const startCheckout = async () => {
    if (!checkoutAvailable || !selected?.id || buying) return;
    setBuying(true);
    setError('');
    try {
      const response = await fetch(resolveApiUrl('/api/payments/creem/credit-checkout'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ packageId: selected.id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.userMessage || data.message || 'Checkout is not available yet.');
        return;
      }
      if (data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
        return;
      }
      setError('Checkout URL was not returned by the payment provider.');
    } catch {
      setError('Could not start checkout. Try again later.');
    } finally {
      setBuying(false);
    }
  };

  return (
    <div className="ai-credits-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="ai-credits-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-credits-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="ai-credits-modal-kicker">Pay as you go</p>
            <h2 id="ai-credits-modal-title">Buy AI Credits</h2>
          </div>
          <button type="button" className="ai-credits-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        {testModeText ? (
          <p className="ai-credits-modal-notice ai-credits-modal-test-mode" role="status">{testModeText}</p>
        ) : null}
        {!checkoutAvailable && (
          <p className="ai-credits-modal-notice" role="status">{notice}</p>
        )}
        {error && (
          <p className="ai-credits-modal-notice" role="alert">{error}</p>
        )}
        {loading ? (
          <p className="ai-credits-modal-loading">Loading packages…</p>
        ) : (
          <>
            <div className="ai-credits-pack-grid">
              {packages.map((pack) => (
                <button
                  key={pack.id}
                  type="button"
                  className={`ai-credits-pack${selected?.id === pack.id ? ' selected' : ''}`}
                  onClick={() => setSelectedId(pack.id)}
                >
                  <strong>{pack.name}</strong>
                  <span>{pack.priceDisplay}</span>
                  <small>{pack.creditsIncluded?.toLocaleString()} credits</small>
                </button>
              ))}
            </div>
            {selected && (
              <p className="ai-credits-modal-summary">
                {selected.name}: {selected.creditsIncluded?.toLocaleString()} credits for {selected.priceDisplay}
                {' '}(one-time, prepaid).
              </p>
            )}
            <button
              type="button"
              className="ai-credits-modal-buy"
              disabled={!checkoutAvailable || buying || !selected}
              onClick={startCheckout}
            >
              {checkoutAvailable
                ? (buying ? 'Starting checkout…' : `Buy ${selected?.name || 'Credits'}`)
                : 'Checkout not available yet'}
            </button>
            <p className="ai-credits-modal-foot">
              Credits are added only after verified payment webhooks. See{' '}
              <a href="/refunds">Refund Policy</a> and{' '}
              <a href="/contact">Contact</a>.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
