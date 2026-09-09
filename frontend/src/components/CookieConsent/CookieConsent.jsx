import { useState } from 'react';
import { Link } from 'react-router-dom';
import './CookieConsent.css';

const consentCookie = 'allmodelai_cookie_consent';
const cookieMaxAge = 60 * 60 * 24 * 365;

function readConsent() {
  return document.cookie
    .split('; ')
    .find((item) => item.startsWith(`${consentCookie}=`))
    ?.split('=')[1] || '';
}

function saveConsent(value) {
  document.cookie = `${consentCookie}=${value}; Max-Age=${cookieMaxAge}; Path=/; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`;
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(() => !readConsent());

  const chooseConsent = (value) => {
    saveConsent(value);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <aside className="cookie-consent" role="dialog" aria-label="Cookie preferences">
      <div>
        <strong>Cookies on AllModelAI</strong>
        <p>We use a necessary session cookie to keep you signed in. Read our <Link to="/cookies">Cookie Policy</Link>.</p>
      </div>
      <div className="cookie-consent-actions">
        <button type="button" className="cookie-decline" onClick={() => chooseConsent('declined')}>Decline</button>
        <button type="button" className="cookie-accept" onClick={() => chooseConsent('accepted')}>Accept</button>
      </div>
    </aside>
  );
}
