const REDIRECT_STORAGE_KEY = 'allmodelai_social_redirect';
const REDIRECT_STORAGE_BACKUP_KEY = 'allmodelai_social_redirect_backup';
export const REDIRECT_PENDING_KEY = 'allmodelai_redirect_pending';

function saveRedirectIntent(name, options = {}, extra = {}) {
  const payload = JSON.stringify({
    name,
    rememberMe: options.rememberMe !== false,
    link: Boolean(options.link),
    returnTo: '/dashboard',
    phase: extra.phase || 'idle',
    expires: Date.now() + 600000,
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

export function reconcileStaleRedirectIntent() {
  const intent = peekRedirectIntent();
  if (!intent) {
    if (isRedirectFlowCommitted()) {
      clearSocialRedirectIntent();
    }
    return;
  }
  if (intent.phase === 'awaiting-google-return' && !isRedirectFlowCommitted()) {
    clearSocialRedirectIntent();
  }
}

export function persistRedirectIntent(name, options, phase) {
  saveRedirectIntent(name, options, { phase });
}
