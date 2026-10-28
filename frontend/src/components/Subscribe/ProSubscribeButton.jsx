import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../lib/apiClient';
import { fetchCheckoutInfo } from '../../lib/paymentCheckoutInfo';
import { buildProCheckoutPath } from '../../lib/modelEntitlements';
import {
  PRO_SUBSCRIPTION_PLAN_KEY,
  PRO_SUBSCRIPTION_PRICE_LABEL,
  PRO_SUBSCRIPTION_TITLE,
} from '../../lib/proSubscription';
import { DEFAULT_WAYFORPAY_CURRENCIES } from '../../lib/wayforpay';
import { useSession } from '../Session/SessionProvider';
import { isAuthInitializing } from '../../lib/authSessionStatus';
import WayforpayPaymentModal from '../Checkout/WayforpayPaymentModal';
import LemonSqueezySubscribeButton from './LemonSqueezySubscribeButton.jsx';
import './ProSubscribeButton.css';

/**
 * Test mode uses the in-app WayForPay mock checkout. The merchant button URL is used only after
 * WAYFORPAY_LIVE_CONFIRM. Opening it does not grant Pro; the callback must verify the payment.
 */
export default function ProSubscribeButton({
  className = '',
  variant = 'violet',
  returnModel,
  returnVariant,
  children,
  onStarted,
}) {
  const navigate = useNavigate();
  const { user, status, refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const [checkoutInfo, setCheckoutInfo] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [wayforpayCurrency, setWayforpayCurrency] = useState('USD');

  useEffect(() => {
    let active = true;
    void fetchCheckoutInfo().then((info) => {
      if (active && info) {
        setCheckoutInfo(info);
        if (info.wayforpayDefaultCurrency) setWayforpayCurrency(info.wayforpayDefaultCurrency);
      }
    });
    return () => { active = false; };
  }, []);

  const checkoutFallbackPath = buildProCheckoutPath({ returnModel, returnVariant });

  const handleClick = useCallback(async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (isAuthInitializing(status)) return;
    if (!user?.email) {
      navigate('/login', { state: { from: checkoutFallbackPath } });
      return;
    }
    onStarted?.();
    const info = checkoutInfo || await fetchCheckoutInfo();
    if (info) setCheckoutInfo(info);
    if (info?.wayforpayLivePaymentsAllowed && info?.wayforpayProButtonUrl) {
      window.location.assign(info.wayforpayProButtonUrl);
      return;
    }
    const provider = info?.primaryProvider;
    if (provider === 'wayforpay' && info?.checkoutAvailable) {
      setModalOpen(true);
      return;
    }
    if (info?.checkoutAvailable) {
      navigate(checkoutFallbackPath);
      return;
    }
    setBusy(true);
    try {
      navigate(checkoutFallbackPath);
    } finally {
      setBusy(false);
    }
  }, [checkoutFallbackPath, checkoutInfo, navigate, onStarted, status, user?.email]);

  const label = children || 'Subscribe';
  const useLemonSqueezy = checkoutInfo?.primaryProvider === 'lemonsqueezy'
    && checkoutInfo?.lemonSqueezyCheckoutEnabled;

  if (useLemonSqueezy) {
    return (
      <LemonSqueezySubscribeButton
        className={className}
        variant={variant}
        variantId={checkoutInfo?.lemonSqueezyVariantId || '2308479'}
        priceLabel={checkoutInfo?.lemonSqueezyPriceLabel || '$20.00'}
        onStarted={onStarted}
      >
        {children || `Subscribe (${checkoutInfo?.lemonSqueezyPriceLabel || '$20.00'}/mo)`}
      </LemonSqueezySubscribeButton>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`pro-subscribe-btn pro-subscribe-btn--${variant}${className ? ` ${className}` : ''}`}
        disabled={busy || isAuthInitializing(status)}
        aria-busy={busy}
        onClick={handleClick}
      >
        {label}
      </button>
      <WayforpayPaymentModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
        }}
        planKey={PRO_SUBSCRIPTION_PLAN_KEY}
        planTitle={PRO_SUBSCRIPTION_TITLE}
        priceLabel={`${PRO_SUBSCRIPTION_PRICE_LABEL} USD`}
        httpClient={apiClient}
        serverTestMode={Boolean(checkoutInfo?.wayforpayTestMode)}
        developerMode={false}
        userEmail={user?.email || ''}
        currency={wayforpayCurrency}
        onCurrencyChange={setWayforpayCurrency}
        supportedCurrencies={checkoutInfo?.wayforpaySupportedCurrencies || DEFAULT_WAYFORPAY_CURRENCIES}
        onPaymentSuccess={async (data) => {
          await refresh({ force: true });
          setModalOpen(false);
          const orderReference = data?.orderReference;
          navigate(
            orderReference
              ? `/checkout/success?plan=pro&orderReference=${encodeURIComponent(orderReference)}`
              : '/dashboard',
            { replace: false },
          );
        }}
      />
    </>
  );
}
