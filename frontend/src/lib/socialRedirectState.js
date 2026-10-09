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

/** True when we should call getRedirectResult / finish OAuth (not for stale abandoned redirects). */
export function shouldAttemptGoogleRedirectRecovery() {
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
  if (!shouldAttemptGoogleRedirectRecovery()) return false;
  return hasActiveRedirectPendingFlag() || hasFirebaseRedirectReturnHints();
}

export function reconcileStaleRedirectIntent() {
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
