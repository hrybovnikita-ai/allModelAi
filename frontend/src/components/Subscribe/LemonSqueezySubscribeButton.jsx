import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { startLemonSqueezyCheckout } from '../../lib/lemonSqueezyCheckout.js';
import { useSession } from '../Session/SessionProvider.jsx';
import { isAuthInitializing } from '../../lib/authSessionStatus.js';
import './ProSubscribeButton.css';

/**
 * Lemon Squeezy USD subscription checkout ($20/mo variant by default).
 */
export default function LemonSqueezySubscribeButton({
  className = '',
  variant = 'violet',
  variantId = '2308479',
  priceLabel = '$20.00',
  children,
  onStarted,
}) {
  const navigate = useNavigate();
  const { user, status } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const label = children || `Subscribe (${priceLabel}/mo)`;

  const handleClick = useCallback(async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (isAuthInitializing(status) || busy) return;
    if (!user?.id) {
      navigate('/login', { state: { from: '/pricing' } });
      return;
    }
    onStarted?.();
    setError('');
    setBusy(true);
    try {
      const checkoutUrl = await startLemonSqueezyCheckout({
        userId: user.id,
        variantId,
      });
      window.location.href = checkoutUrl;
    } catch (err) {
      setError(err.message || 'Checkout failed.');
      setBusy(false);
    }
  }, [busy, navigate, onStarted, status, user?.id, variantId]);

  return (
    <div className="lemon-squeezy-subscribe-wrap">
      <button
        type="button"
        className={`pro-subscribe-btn pro-subscribe-btn--${variant}${className ? ` ${className}` : ''}`}
        disabled={busy || isAuthInitializing(status)}
        aria-busy={busy}
        onClick={handleClick}
      >
        {busy ? 'Opening checkout…' : label}
      </button>
      {error ? (
        <p className="lemon-squeezy-subscribe-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
