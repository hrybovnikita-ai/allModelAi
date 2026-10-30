const REDIRECT_STORAGE_KEY = 'allmodelai_social_redirect';
const REDIRECT_STORAGE_BACKUP_KEY = 'allmodelai_social_redirect_backup';
export const REDIRECT_PENDING_KEY = 'allmodelai_redirect_pending';
/** Same flag as REDIRECT_PENDING_KEY (Firebase redirect sign-in in progress). */
export const FIREBASE_AUTH_REDIRECT_PENDING_KEY = REDIRECT_PENDING_KEY;

function saveRedirectIntent(name, options = {}, extra = {}) {
  const phase = extra.phase || 'idle';
  const payload = JSON.stringify({
    name,
    rememberMe: options.rememberMe !== false,
    link: Boolean(options.link),
    returnTo: '/dashboard',
    phase,
    expires: Date.now() + 600000,
    redirectStartedAt: phase === 'awaiting-google-return' ? Date.now() : extra.redirectStartedAt,
    challengeState: typeof options.challengeState === 'string' ? options.challengeState : undefined,
  });
  try {
    sessionStorage.setItem(REDIRECT_STORAGE_KEY, payload);
  } catch {
    /* Safari private mode */
  }
  try {
    localStorage.setItem(REDIRECT_STORAGE_BACKUP_KEY, payload);
  } catch {
    /* Storage blocked */
  }
}

export function peekRedirectIntent() {
  const sources = [];
  try {
    const sessionValue = sessionStorage.getItem(REDIRECT_STORAGE_KEY);
    if (sessionValue) sources.push(sessionValue);
  } catch {
    /* ignore */
  }
  try {
    const backupValue = localStorage.getItem(REDIRECT_STORAGE_BACKUP_KEY);
    if (backupValue) sources.push(backupValue);
  } catch {
    /* ignore */
  }

  for (const raw of sources) {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed?.name || parsed.expires < Date.now()) {
        continue;
      }
      return parsed;
    } catch {
      /* try next source */
    }
  }
  return null;
}

const REDIRECT_PENDING_BACKUP_KEY = `${REDIRECT_PENDING_KEY}_backup`;

export function markRedirectFlowCommitted() {
  try {
    sessionStorage.setItem(REDIRECT_PENDING_KEY, 'true');
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(REDIRECT_PENDING_BACKUP_KEY, 'true');
  } catch {
    /* Safari / storage partitions */
  }
}

export function isRedirectFlowCommitted() {
  try {
    if (sessionStorage.getItem(REDIRECT_PENDING_KEY) === 'true') return true;
  } catch {
    /* ignore */
  }
  try {
    return localStorage.getItem(REDIRECT_PENDING_BACKUP_KEY) === 'true';
  } catch {
    return false;
  }
}

function clearRedirectFlowCommitted() {
  try {
    sessionStorage.removeItem(REDIRECT_PENDING_KEY);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(REDIRECT_PENDING_BACKUP_KEY);
  } catch {
    /* ignore */
  }
}

export function clearSocialRedirectIntent() {
  try {
    sessionStorage.removeItem(REDIRECT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(REDIRECT_STORAGE_BACKUP_KEY);
  } catch {
    /* ignore */
  }
  clearRedirectFlowCommitted();
}

/** Redirect recovery runs only after signInWithRedirect was actually started. */
export function isGoogleRedirectRecoveryPending() {
  const intent = peekRedirectIntent();
  if (intent?.phase !== 'awaiting-google-return') return false;
  return isRedirectFlowCommitted();
}

/** OAuth return navigation (Firebase handler or auth query params on the app URL). */
export function hasFirebaseRedirectReturnHints() {
  if (typeof window === 'undefined') return false;
  const { pathname, search, hash } = window.location;
  if (/\/__\/auth\/handler/i.test(pathname)) return true;
  const combined = `${search}${hash}`;
  return /(?:^|[?&#])(apiKey|authType|code|state|oauth|providerId|mode)=/i.test(combined);
}

export function hasActiveRedirectPendingFlag() {
  try {
    if (sessionStorage.getItem(REDIRECT_PENDING_KEY) === 'true') return true;
  } catch {
    /* ignore */
  }
  try {
    return localStorage.getItem(REDIRECT_PENDING_BACKUP_KEY) === 'true';
  } catch {
    return false;
  }
}

const REDIRECT_RECOVERY_WINDOW_MS = 180000;
/** Max time a Google OAuth lock may stay held before auto-release (popup timeout is 120s). */
export const GOOGLE_SIGNIN_FLOW_MAX_MS = 125_000;
let redirectIntentReconcileBlocked = false;
let googlePopupSignInActive = false;
/** Synchronous guard: one Google OAuth flow (popup or redirect) at a time. */
let googleSignInFlowActive = false;
let googleSignInFlowStartedAt = 0;

export const GOOGLE_POPUP_SIGNIN_EVENT = 'allmodelai-google-popup-signin';

export function isGooglePopupSignInActive() {
  return googlePopupSignInActive;
}

export function isGoogleSignInFlowActive() {
  return googleSignInFlowActive || googlePopupSignInActive;
}

function isGoogleSignInFlowStale() {
  if (!googleSignInFlowActive && !googlePopupSignInActive) return false;
  // First observation without a timestamp: start the TTL clock, do not treat as stale yet.
  if (!googleSignInFlowStartedAt) {
    googleSignInFlowStartedAt = Date.now();
    return false;
  }
  return Date.now() - googleSignInFlowStartedAt > GOOGLE_SIGNIN_FLOW_MAX_MS;
}

/**
 * Force-clear popup/redirect locks after cancel, timeout, navigation, or a stuck flow.
 * Safe to call repeatedly.
 */
export function forceReleaseGoogleSignInFlow(reason = 'manual') {
  const wasActive = googleSignInFlowActive || googlePopupSignInActive;
  googleSignInFlowActive = false;
  googleSignInFlowStartedAt = 0;
  if (googlePopupSignInActive) {
    googlePopupSignInActive = false;
    setRedirectIntentReconcileBlocked(false);
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(GOOGLE_POPUP_SIGNIN_EVENT, { detail: { active: false, reason } }));
    }
  } else {
    setRedirectIntentReconcileBlocked(false);
  }
  if (wasActive && typeof console !== 'undefined' && console.debug) {
    console.debug('[AllModelAI:Auth] Released Google sign-in flow lock', { reason });
  }
}

/** @returns {boolean} true when this caller may start OAuth */
export function beginGoogleSignInFlow() {
  if (googleSignInFlowActive || googlePopupSignInActive) {
    if (isGoogleSignInFlowStale()) {
      forceReleaseGoogleSignInFlow('stale-flow-ttl');
    } else {
      return false;
    }
  }
  googleSignInFlowActive = true;
  googleSignInFlowStartedAt = Date.now();
  return true;
}

export function endGoogleSignInFlow() {
  googleSignInFlowActive = false;
  if (!googlePopupSignInActive) {
    googleSignInFlowStartedAt = 0;
  }
}

export function resetGoogleSignInFlowForTests() {
  forceReleaseGoogleSignInFlow('test-reset');
}

/** Desktop/Android popup flow — must not run redirect recovery or getRedirectResult in parallel. */
export function markGooglePopupSignInStarted() {
  googlePopupSignInActive = true;
  if (!googleSignInFlowStartedAt) {
    googleSignInFlowStartedAt = Date.now();
  }
  setRedirectIntentReconcileBlocked(true);
  clearSocialRedirectIntent();
  void import('./authBootstrap.js').then(({ invalidateAuthBootstrap }) => {
    invalidateAuthBootstrap();
  }).catch(() => {});
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(GOOGLE_POPUP_SIGNIN_EVENT, { detail: { active: true } }));
  }
}

export function markGooglePopupSignInEnded() {
  googlePopupSignInActive = false;
  setRedirectIntentReconcileBlocked(false);
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(GOOGLE_POPUP_SIGNIN_EVENT, { detail: { active: false } }));
  }
}

export function setRedirectIntentReconcileBlocked(blocked) {
  redirectIntentReconcileBlocked = Boolean(blocked);
}

export function isRedirectIntentReconcileBlocked() {
  return redirectIntentReconcileBlocked;
}

/** True when we should call getRedirectResult / finish OAuth (not for stale abandoned redirects). */
export function shouldAttemptGoogleRedirectRecovery() {
  if (isGooglePopupSignInActive()) return false;
  if (!isGoogleRedirectRecoveryPending()) return false;
  if (hasFirebaseRedirectReturnHints()) return true;
  const intent = peekRedirectIntent();
  if (!intent) return false;
  if (intent.expires < Date.now()) return false;
  if (!intent.redirectStartedAt) return true;
  return Date.now() - intent.redirectStartedAt < REDIRECT_RECOVERY_WINDOW_MS;
}

/** Full-screen “Finishing sign-in” — pending flag and/or OAuth return URL. */
export function shouldShowGoogleRedirectRecoveryUI() {
  if (isGooglePopupSignInActive()) return false;
  if (!shouldAttemptGoogleRedirectRecovery()) return false;
  return hasActiveRedirectPendingFlag() || hasFirebaseRedirectReturnHints();
}

export function reconcileStaleRedirectIntent() {
  if (redirectIntentReconcileBlocked) {
    return;
  }
  const intent = peekRedirectIntent();
  if (!intent) {
    if (isRedirectFlowCommitted()) {
      clearSocialRedirectIntent();
    }
    return;
  }
  if (intent.expires < Date.now()) {
    clearSocialRedirectIntent();
    return;
  }
  if (intent.phase === 'awaiting-google-return' && !isRedirectFlowCommitted()) {
    clearSocialRedirectIntent();
    return;
  }
  if (intent.phase === 'awaiting-google-return' && isRedirectFlowCommitted() && !shouldAttemptGoogleRedirectRecovery()) {
    clearSocialRedirectIntent();
  }
}

export function persistRedirectIntent(name, options, phase) {
  saveRedirectIntent(name, options, { phase });
}
