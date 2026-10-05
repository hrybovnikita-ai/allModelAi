import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signInWithCredential,
  linkWithCredential,
  sendEmailVerification,
  signOut,
} from 'firebase/auth';
import { getEffectiveFirebaseConfig, getFirebaseOAuthOrigin, getSocialAuth } from './firebase.js';
import { isCapacitorNative } from './apiBase.js';
import { exchangeSocialSession, prepareSocialSession } from './socialSession.js';
import { SOCIAL_PROVIDER_LABELS } from './socialProviders.js';
import { socialAuthDebug } from './socialAuthDiagnostics.js';
import { shouldPreferGoogleRedirectSignIn } from './socialSignInEnv.js';

const REDIRECT_STORAGE_KEY = 'allmodelai_social_redirect';
const REDIRECT_STORAGE_BACKUP_KEY = 'allmodelai_social_redirect_backup';
const GOOGLE_PROVIDER = 'Google';

let pendingLink = null;
let redirectExchangePromise = null;

export const SOCIAL_PROVIDERS = SOCIAL_PROVIDER_LABELS;

export function providerLabel(name) {
  return name;
}

function providerFor(name) {
  if (name === GOOGLE_PROVIDER) {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return provider;
  }
  throw new Error('Unsupported provider.');
}

async function completeFromFirebaseUser(firebaseUser, options) {
  if (!firebaseUser.emailVerified) {
    await sendEmailVerification(firebaseUser);
    throw Object.assign(
      new Error('Verify your email with the provider, then try again.'),
      { code: 'auth/email-not-verified' },
    );
  }

  socialAuthDebug('FIREBASE_ID_TOKEN_READY', { provider: GOOGLE_PROVIDER });
  socialAuthDebug('BACKEND_SESSION_EXCHANGE_STARTED', { intent: options?.link ? 'link' : 'login' });
  try {
    const user = await exchangeSocialSession(await firebaseUser.getIdToken(true), options);
    socialAuthDebug('BACKEND_SESSION_EXCHANGE_SUCCESS', { email: user?.email });
    return user;
  } catch (error) {
    socialAuthDebug('BACKEND_SESSION_EXCHANGE_FAILED', { code: error.code, message: error.message });
    throw error;
  }
}

async function complete(result, options) {
  return completeFromFirebaseUser(result.user, options);
}

function saveRedirectIntent(name, options = {}) {
  const payload = JSON.stringify({
    name,
    rememberMe: options.rememberMe !== false,
    link: Boolean(options.link),
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

export function readRedirectIntent() {
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
  clearSocialRedirectIntent();
  return null;
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
}

export function cancelSocialLink() {
  pendingLink = null;
}

function shouldUseRedirectSignIn() {
  return isCapacitorNative() || shouldPreferGoogleRedirectSignIn();
}

function logRedirectDomainHint() {
  if (!import.meta.env?.DEV || typeof window === 'undefined') return;
  const { authDomain } = getEffectiveFirebaseConfig();
  const appHost = window.location.hostname;
  if (authDomain && appHost && !appHost.endsWith('.firebaseapp.com') && authDomain.includes('firebaseapp.com')) {
    console.info(
      `[AllModelAI:SocialAuth] App host ${appHost} uses Firebase authDomain ${authDomain}. `
      + 'Redirect sign-in is supported when the app host is listed under Firebase Authorized domains.',
    );
  }
}

async function signInWithProvider(auth, name, options) {
  const provider = providerFor(name);
  if (shouldUseRedirectSignIn()) {
    logRedirectDomainHint();
    socialAuthDebug('GOOGLE_REDIRECT_STARTED', {
      path: typeof window !== 'undefined' ? window.location.pathname : '',
      mobileSafari: shouldPreferGoogleRedirectSignIn(),
    });
    saveRedirectIntent(name, options);
    try {
      await prepareSocialSession(options);
    } catch (error) {
      clearSocialRedirectIntent();
      throw error;
    }
    ensureRedirectReturnPath();
    await signInWithRedirect(auth, provider);
    return { redirected: true };
  }
  try {
    const result = await signInWithPopup(auth, provider);
    return { result };
  } catch (error) {
    if (error.code === 'auth/popup-blocked') {
      socialAuthDebug('GOOGLE_REDIRECT_STARTED', { reason: 'popup-blocked' });
      saveRedirectIntent(name, options);
      try {
        await prepareSocialSession(options);
      } catch (prepareError) {
        clearSocialRedirectIntent();
        throw prepareError;
      }
      ensureRedirectReturnPath();
      await signInWithRedirect(auth, provider);
      return { redirected: true };
    }
    throw error;
  }
}

export async function socialSignIn(name, options = {}) {
  if (name !== GOOGLE_PROVIDER) {
    throw new Error('Only Google sign-in is available.');
  }
  if (typeof window !== 'undefined' && !getFirebaseOAuthOrigin()) {
    throw new Error('Sign-in requires a browser origin. Open AllModelAI from your site URL, not a file:// link.');
  }
  const auth = getSocialAuth();
  pendingLink = null;

  try {
    const signInOutcome = await signInWithProvider(auth, name, options);
    if (signInOutcome.redirected) {
      return { redirected: true };
    }
    const challenge = await prepareSocialSession(options);
    return await complete(signInOutcome.result, {
      ...options,
      challenge,
    });
  } catch (error) {
    if (options?.link && error.code === 'auth/account-exists-with-different-credential') {
      const credential = GoogleAuthProvider.credentialFromError(error);
      if (credential) {
        pendingLink = {
          credential,
          options,
          challengePromise: prepareSocialSession(options),
          expires: Date.now() + 300000,
        };
      }
    }
    throw error;
  } finally {
    if (!readRedirectIntent()) {
      await signOut(auth).catch(() => {});
    }
  }
}

export async function finishSocialLink(existingProvider) {
  if (!pendingLink || pendingLink.expires < Date.now()) {
    throw new Error('Linking expired. Select the provider again.');
  }
  const pending = pendingLink;
  pendingLink = null;
  const auth = getSocialAuth();
  try {
    const [original, challenge] = await Promise.all([
      signInWithPopup(auth, providerFor(existingProvider)),
      pending.challengePromise,
    ]);
    await linkWithCredential(original.user, pending.credential);
    const result = await signInWithCredential(auth, pending.credential);
    return await complete(result, { ...pending.options, challenge });
  } finally {
    await signOut(auth).catch(() => {});
  }
}

function waitForFirebaseUser(auth, timeoutMs = 8000) {
  if (auth.currentUser) {
    socialAuthDebug('FIREBASE_USER_RESTORED', { source: 'currentUser' });
    return Promise.resolve(auth.currentUser);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (user, source) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      clearTimeout(timer);
      if (user) {
        socialAuthDebug('FIREBASE_USER_RESTORED', { source });
      }
      resolve(user || null);
    };

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) finish(user, 'onAuthStateChanged');
    });

    const timer = setTimeout(() => {
      finish(auth.currentUser, 'timeout');
    }, timeoutMs);
  });
}

async function resolveRedirectFirebaseUser(auth, { allowAuthStateFallback = false } = {}) {
  const redirectResult = await getRedirectResult(auth).catch((error) => {
    socialAuthDebug('GOOGLE_REDIRECT_RESULT', { ok: false, code: error?.code });
    return null;
  });

  if (redirectResult?.user) {
    socialAuthDebug('GOOGLE_REDIRECT_RESULT', { ok: true, source: 'getRedirectResult' });
    return redirectResult;
  }

  socialAuthDebug('GOOGLE_REDIRECT_RESULT', { ok: false, source: 'empty' });
  if (!allowAuthStateFallback) {
    return null;
  }

  const restoredUser = await waitForFirebaseUser(auth);
  if (!restoredUser) {
    return null;
  }
  return { user: restoredUser };
}

function ensureRedirectReturnPath() {
  if (typeof window === 'undefined') return;
  if (window.location.pathname.startsWith('/auth/callback')) return;
  try {
    window.history.replaceState(null, '', '/auth/callback');
  } catch {
    /* ignore */
  }
}

async function completeSocialRedirectInternal() {
  const auth = getSocialAuth();
  const pending = readRedirectIntent();
  const redirectResult = await resolveRedirectFirebaseUser(auth, {
    allowAuthStateFallback: Boolean(pending),
  });
  if (!redirectResult?.user) {
    return null;
  }

  const options = {
    rememberMe: pending?.rememberMe !== false,
    link: Boolean(pending?.link),
  };

  try {
    const challenge = await prepareSocialSession(options);
    const user = await complete(redirectResult, {
      ...options,
      challenge,
    });
    clearSocialRedirectIntent();
    return user;
  } catch (error) {
    socialAuthDebug('BACKEND_SESSION_EXCHANGE_FAILED', { code: error.code, message: error.message });
    throw error;
  } finally {
    await signOut(auth).catch(() => {});
  }
}

/**
 * Call once after returning from Google redirect (any route). Completes backend session at most once.
 */
export async function resumePendingSocialRedirect() {
  if (redirectExchangePromise) {
    return redirectExchangePromise;
  }

  const hasIntent = Boolean(readRedirectIntent());
  const onAuthRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/auth/');
  if (!hasIntent && !onAuthRoute) {
    return null;
  }

  redirectExchangePromise = completeSocialRedirectInternal()
    .finally(() => {
      redirectExchangePromise = null;
    });

  return redirectExchangePromise;
}

/** @deprecated Use resumePendingSocialRedirect */
export async function completeSocialRedirect() {
  return resumePendingSocialRedirect();
}

export function navigateAfterSocialLogin(user, { navigate, replaceDashboard = false } = {}) {
  if (!user?.email) return;
  socialAuthDebug('DASHBOARD_REDIRECT', { replace: replaceDashboard || shouldPreferGoogleRedirectSignIn() });
  if (replaceDashboard || shouldPreferGoogleRedirectSignIn()) {
    window.location.replace('/dashboard');
    return;
  }
  navigate?.('/dashboard', { replace: true, state: { user } });
}
