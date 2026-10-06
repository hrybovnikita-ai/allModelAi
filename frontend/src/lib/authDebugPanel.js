import { getApiBase, getBrowserApiOrigin, isBrowserLocalhostDev, prefersSameOriginApi } from './apiBase.js';
import { getEffectiveFirebaseConfig, isFirebaseSocialConfigured } from './firebase.js';
import { isGoogleRedirectRecoveryPending, peekRedirectIntent } from './socialRedirectState.js';
import { shouldPreferGoogleRedirectSignIn } from './socialSignInEnv.js';
import { canUseGoogleRedirectSignIn } from './storageAvailability.js';

const AUTH_DEBUG_QUERY = 'authdebug';
const AUTH_DEBUG_STORAGE = 'allmodelai_auth_debug_panel';

export function isAuthDebugPanelEnabled() {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get(AUTH_DEBUG_QUERY) === '1') {
      sessionStorage.setItem(AUTH_DEBUG_STORAGE, '1');
      return true;
    }
    if (params.get(AUTH_DEBUG_QUERY) === '0') {
      sessionStorage.removeItem(AUTH_DEBUG_STORAGE);
      return false;
    }
    return sessionStorage.getItem(AUTH_DEBUG_STORAGE) === '1';
  } catch {
    return false;
  }
}

/** Safe auth diagnostics for support (no tokens, cookies, or secrets). */
export function collectAuthDiagnostics(sessionState = {}) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const intent = peekRedirectIntent();
  const firebase = getEffectiveFirebaseConfig();
  const apiRouting = prefersSameOriginApi()
    ? 'same-origin'
    : (getApiBase() ? 'direct-backend' : 'relative-or-proxy');
  return {
    appVersion: import.meta.env?.VITE_APP_VERSION || import.meta.env?.MODE || 'unknown',
    buildMode: import.meta.env?.MODE || 'unknown',
    origin,
    pathname,
    apiBase: getApiBase() || '(same-origin /api)',
    browserApiOrigin: getBrowserApiOrigin(),
    prefersSameOriginApi: prefersSameOriginApi(),
    localViteDev: isBrowserLocalhostDev(),
    firebaseInitialized: isFirebaseSocialConfigured(),
    firebaseAuthDomain: firebase.authDomain || '(unset)',
    googleAuthMode: shouldPreferGoogleRedirectSignIn() ? 'redirect' : 'popup',
    redirectStorageOk: canUseGoogleRedirectSignIn(),
    redirectIntent: intent?.phase === 'awaiting-google-return' ? 'YES' : 'NO',
    redirectRecoveryPending: isGoogleRedirectRecoveryPending(),
    redirectIntentPhase: intent?.phase || '(none)',
    apiRouting,
    navigationMode: 'SPA',
    sessionProviderStatus: sessionState.status || '(unknown)',
    sessionProviderHasUser: Boolean(sessionState.user?.email),
    serverSessionVerified: sessionState.serverSessionVerified || 'UNKNOWN',
    timestamp: new Date().toISOString(),
  };
}

export function formatAuthDiagnosticsReport(diagnostics) {
  return Object.entries(diagnostics)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
}
