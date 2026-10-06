const consentCookie = 'allmodelai_cookie_consent';
export const COOKIE_CONSENT_UPDATED_EVENT = 'allmodelai:cookie-consent-updated';

export function readCookieConsent() {
  if (typeof document === 'undefined') return '';
  return document.cookie
    .split('; ')
    .find((item) => item.startsWith(`${consentCookie}=`))
    ?.split('=')[1] || '';
}

export function hasAcceptedCookieConsent() {
  return readCookieConsent() === 'accepted';
}

export function notifyCookieConsentUpdated(value) {
  if (typeof globalThis.dispatchEvent !== 'function') return;
  globalThis.dispatchEvent(new CustomEvent(COOKIE_CONSENT_UPDATED_EVENT, { detail: { value } }));
}

export function waitForCookieConsentChoice(timeoutMs = 120000) {
  if (typeof document === 'undefined') {
    return Promise.resolve('');
  }
  if (readCookieConsent()) {
    return Promise.resolve(readCookieConsent());
  }
  return new Promise((resolve) => {
    const finish = (value) => {
      clearTimeout(timer);
      globalThis.removeEventListener(COOKIE_CONSENT_UPDATED_EVENT, onUpdate);
      resolve(value);
    };
    const onUpdate = (event) => {
      finish(event.detail?.value || readCookieConsent());
    };
    globalThis.addEventListener(COOKIE_CONSENT_UPDATED_EVENT, onUpdate);
    const timer = setTimeout(() => finish(readCookieConsent()), timeoutMs);
  });
}
