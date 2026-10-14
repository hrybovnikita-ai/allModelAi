import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import PaymentButton from './PaymentButton';
import {
  cardFormComplete,
  formatCardNumber,
  formatCvc,
  formatExpiry,
  isMockTestCardNumber,
} from '../../lib/paymentCardFormat';
import { executeWayforpayCheckout, shouldSimulateWayforpayCheckout } from '../../lib/wayforpayCheckoutFlow';
import { DEFAULT_WAYFORPAY_CURRENCIES } from '../../lib/wayforpay';
import './WayforpayPaymentModal.css';

const PAYMENT_METHODS = [
  { id: 'card', label: 'Card', badge: '💳' },
  { id: 'apple_pay', label: 'Apple Pay', badge: 'Apple' },
  { id: 'google_pay', label: 'Google Pay', badge: 'G Pay' },
];

export default function WayforpayPaymentModal({
  open,
  onClose,
  planKey,
  planTitle,
  priceLabel,
  httpClient,
  serverTestMode = false,
  developerMode = false,
  userEmail = '',
  currency = 'USD',
  onCurrencyChange,
  supportedCurrencies = DEFAULT_WAYFORPAY_CURRENCIES,
  onPaymentSuccess,
  t = (s) => s,
}) {
  const [method, setMethod] = useState('card');
  const [card, setCard] = useState({
    cardNumber: '',
    expiry: '',
    cvc: '',
    holder: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState('form');
  const [successMeta, setSuccessMeta] = useState(null);

  useEffect(() => {
    if (!open) {
      setPhase('form');
      setError('');
      setSuccessMeta(null);
      setBusy(false);
    }
  }, [open]);

  useEffect(() => {
    if (open && userEmail && !card.holder) {
      setCard((c) => ({ ...c, holder: userEmail.split('@')[0] || '' }));
    }
  }, [open, userEmail, card.holder]);

  const simulateMode = useMemo(
    () => shouldSimulateWayforpayCheckout({
      serverTestMode,
      developerMode,
      cardNumber: card.cardNumber,
    }),
    [serverTestMode, developerMode, card.cardNumber],
  );

  const cardDigits = card.cardNumber.replace(/\D/g, '');
  const cardValidHint = cardDigits.length >= 13 && isMockTestCardNumber(card.cardNumber);

  const updateCard = useCallback((key) => (event) => {
    let { value } = event.target;
    if (key === 'cardNumber') value = formatCardNumber(value);
    if (key === 'expiry') value = formatExpiry(value);
    if (key === 'cvc') value = formatCvc(value);
    setCard((current) => ({ ...current, [key]: value }));
    setError('');
  }, []);

  const canPay = useMemo(() => {
    if (method !== 'card') return true;
    return cardFormComplete(card);
  }, [method, card]);

  useEffect(() => {
    if (phase !== 'success') return undefined;
    const timer = window.setTimeout(() => {
      onClose?.();
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [phase, onClose]);

  const handlePay = async () => {
    if (busy || !planKey) return;
    if (method === 'card' && !canPay) {
      setError(t('Please complete all card fields.'));
      return;
    }

    setBusy(true);
    setError('');
    try {
      const developerPayload = developerMode
        ? {
          plan: planKey,
          cardNumber: card.cardNumber,
          holder: card.holder,
          email: userEmail,
          expiry: card.expiry,
          cvc: card.cvc,
        }
        : null;

      const result = await executeWayforpayCheckout({
        httpClient,
        planKey,
        currency,
        serverTestMode,
        developerMode,
        cardNumber: card.cardNumber,
        developerPayload,
      });

      if (result.mode === 'redirect') {
        return;
      }

      const orderReference = result.data?.orderReference || result.data?.order_reference;
      const message = result.data?.message || t('Thanks for your purchase!');
      setSuccessMeta({
        orderReference,
        message,
        planName: result.data?.planName || planTitle,
      });
      setPhase('success');
      await onPaymentSuccess?.(result.data);
    } catch (payError) {
      setError(payError.message || t('Payment could not be completed.'));
    } finally {
      setBusy(false);
    }
  };

  if (!open || typeof document === 'undefined') return null;

  const modal = phase === 'success' ? (
    <div className="wfp-pay-backdrop" role="presentation" onClick={onClose}>
      <section
        className="wfp-pay-modal wfp-pay-modal--success"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wfp-pay-success-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="wfp-pay-success-icon" aria-hidden="true">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path d="M5 12.5 9.5 17 19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="wfp-pay-modal__eyebrow">{simulateMode ? t('Test payment') : t('Payment successful')}</p>
        <h2 id="wfp-pay-success-title">{t('Thanks for your purchase!')}</h2>
        <p className="wfp-pay-modal__subtitle">{successMeta?.message}</p>
        {successMeta?.orderReference && (
          <p className="wfp-pay-success-ref">
            {t('Order')}: {successMeta.orderReference}
          </p>
        )}
        <p className="wfp-pay-modal__subtitle">{t('Closing in a few seconds…')}</p>
      </section>
    </div>
  ) : (
    <div className="wfp-pay-backdrop" role="presentation" onClick={onClose}>
      <section
        className="wfp-pay-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wfp-pay-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="wfp-pay-modal__close" onClick={onClose} aria-label={t('Close')}>
          ×
        </button>
        <p className="wfp-pay-modal__eyebrow">{t('Secure checkout')}</p>
        <h2 id="wfp-pay-title">{planTitle || t('Complete payment')}</h2>
        <p className="wfp-pay-modal__subtitle">
          {priceLabel ? `${priceLabel} · ` : ''}
          {t('WayForPay')}
        </p>

        <div className="wfp-pay-mode-badges">
          <span className={`wfp-pay-mode-badge ${simulateMode ? 'wfp-pay-mode-badge--test' : 'wfp-pay-mode-badge--live'}`}>
            {simulateMode ? t('Test mode') : t('Live payment')}
          </span>
        </div>

        {!simulateMode && onCurrencyChange && (
          <div className="wfp-pay-currency-row">
            <span>{t('Currency')}</span>
            <select
              value={currency}
              onChange={(e) => onCurrencyChange(e.target.value)}
              disabled={busy}
              aria-label={t('Payment currency')}
            >
              {supportedCurrencies.map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
          </div>
        )}

        <div className="wfp-pay-methods" role="tablist" aria-label={t('Payment method')}>
          {PAYMENT_METHODS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={method === item.id}
              className={`wfp-pay-method ${method === item.id ? 'active' : ''}`}
              onClick={() => setMethod(item.id)}
              disabled={busy}
            >
              <span className="wfp-pay-method__icon" aria-hidden="true">{item.badge}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {method === 'card' ? (
          <fieldset className="wfp-pay-fieldset" disabled={busy}>
            <label className="wfp-pay-field">
              <span>{t('Cardholder name')}</span>
              <input
                type="text"
                autoComplete="cc-name"
                placeholder={t('Name on card')}
                value={card.holder}
                onChange={updateCard('holder')}
              />
            </label>
            <label className="wfp-pay-field">
              <span>{t('Card number')}</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="cc-number"
                placeholder="4242 4242 4242 4242"
                value={card.cardNumber}
                onChange={updateCard('cardNumber')}
                className={cardValidHint && simulateMode ? 'wfp-pay-input--valid' : ''}
              />
            </label>
            <div className="wfp-pay-row">
              <label className="wfp-pay-field">
                <span>{t('Expiry')}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="cc-exp"
                  placeholder="MM/YY"
                  value={card.expiry}
                  onChange={updateCard('expiry')}
                />
              </label>
              <label className="wfp-pay-field">
                <span>{t('CVC')}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="cc-csc"
                  placeholder="123"
                  value={card.cvc}
                  onChange={updateCard('cvc')}
                />
              </label>
            </div>
          </fieldset>
        ) : (
          <p className="wfp-pay-wallet-note">
            {t('You will continue on WayForPay’s secure page to complete')}{' '}
            {method === 'apple_pay' ? 'Apple Pay' : 'Google Pay'}.
            {simulateMode ? ` ${t('Test mode — no real charge.')}` : ''}
          </p>
        )}

        {error && <p className="wfp-pay-error" role="alert">{error}</p>}

        <PaymentButton
          type="button"
          className="wfp-pay-submit"
          loading={busy}
          loadingLabel={simulateMode ? t('Simulating payment…') : t('Redirecting to WayForPay…')}
          disabled={!canPay && method === 'card'}
          onClick={() => { void handlePay(); }}
        >
          {simulateMode ? t('Pay now (test)') : t('Pay now')}
        </PaymentButton>
      </section>
    </div>
  );

  return createPortal(modal, document.body);
}
