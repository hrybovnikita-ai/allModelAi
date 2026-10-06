import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signInWithCredential,
  linkWithCredential,
  sendEmailVerification,
  signOut,
} from 'firebase/auth';
import { ensureSocialAuthReady, getEffectiveFirebaseConfig, getFirebaseOAuthOrigin } from './firebase.js';
import { isCapacitorNative } from './apiBase.js';
import { markFreshLogin } from './session.js';
import { exchangeSocialSession, prepareSocialSession } from './socialSession.js';
import { SOCIAL_PROVIDER_LABELS } from './socialProviders.js';
import { describeRedirectRecoveryFailure, socialAuthDebug } from './socialAuthDiagnostics.js';
import { shouldPreferGoogleRedirectSignIn } from './socialSignInEnv.js';
import { consumeFirebaseRedirectResult, hasRedirectResultBeenConsumed } from './firebaseRedirectCoordinator.js';
import { bootstrapGoogleRedirectRecovery, waitForGoogleRedirectRecovery } from './googleRedirectRecovery.js';

const REDIRECT_STORAGE_KEY = 'allmodelai_social_redirect';
const REDIRECT_STORAGE_BACKUP_KEY = 'allmodelai_social_redirect_backup';
const GOOGLE_PROVIDER = 'Google';

let pendingLink = null;
let redirectRecoveryPromise = null;

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

async function prepareBackendChallenge(options) {
  socialAuthDebug('BACKEND_CHALLENGE_START', { intent: options?.link ? 'link' : 'login' });
  const challenge = await prepareSocialSession(options);
  socialAuthDebug('BACKEND_CHALLENGE_SUCCESS', { intent: options?.link ? 'link' : 'login' });
  return challenge;
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
  socialAuthDebug('BACKEND_SESSION_EXCHANGE_START', { intent: options?.link ? 'link' : 'login' });
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

export function readRedirectIntent() {
  return peekRedirectIntent();
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

export function isAuthCallbackRoute(pathname = typeof window !== 'undefined' ? window.location.pathname : '') {
  return String(pathname || '').startsWith('/auth/');
}

async function signInWithProvider(auth, name, options) {
  const provider = providerFor(name);
  if (shouldUseRedirectSignIn()) {
    socialAuthDebug('GOOGLE_AUTH_START', {
      path: typeof window !== 'undefined' ? window.location.pathname : '',
      mobileSafari: shouldPreferGoogleRedirectSignIn(),
    });

    saveRedirectIntent(name, options, { phase: 'preparing' });
    const challenge = await prepareBackendChallenge(options);
    saveRedirectIntent(name, { ...options, challengeState: challenge?.state }, { phase: 'awaiting-google-return' });

    socialAuthDebug('GOOGLE_AUTH_STRATEGY', { mode: 'redirect' });
    socialAuthDebug('FIREBASE_REDIRECT_START', {
      path: typeof window !== 'undefined' ? window.location.pathname : '',
      authDomain: getEffectiveFirebaseConfig().authDomain,
    });

    await signInWithRedirect(auth, provider);
    return { redirected: true };
  }

  try {
    const result = await signInWithPopup(auth, provider);
    return { result };
  } catch (error) {
    if (error.code === 'auth/popup-blocked') {
      socialAuthDebug('GOOGLE_AUTH_START', { reason: 'popup-blocked' });
      saveRedirectIntent(name, options, { phase: 'preparing' });
      const challenge = await prepareBackendChallenge(options);
      saveRedirectIntent(name, { ...options, challengeState: challenge?.state }, { phase: 'awaiting-google-return' });
      socialAuthDebug('FIREBASE_REDIRECT_START', { reason: 'popup-blocked' });
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
  const auth = await ensureSocialAuthReady();
  pendingLink = null;

  let redirected = false;
  try {
    const signInOutcome = await signInWithProvider(auth, name, options);
    if (signInOutcome.redirected) {
      redirected = true;
      return { redirected: true };
    }
    socialAuthDebug('GOOGLE_AUTH_STRATEGY', { mode: 'popup' });
    const challenge = await prepareBackendChallenge(options);
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
          challengePromise: prepareBackendChallenge(options),
          expires: Date.now() + 300000,
        };
      }
    }
    throw error;
  } finally {
    if (!redirected && !peekRedirectIntent()) {
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
  const auth = await ensureSocialAuthReady();
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

async function runGoogleRedirectRecoveryPipeline(consumer) {
  if (redirectRecoveryPromise) {
    return redirectRecoveryPromise;
  }

  redirectRecoveryPromise = (async () => {
    const pending = peekRedirectIntent();
    if (!pending || pending.phase !== 'awaiting-google-return') {
      return null;
    }

    const auth = await ensureSocialAuthReady();
    socialAuthDebug('FIREBASE_REDIRECT_RETURN', {
      consumer,
      hasIntent: true,
      path: typeof window !== 'undefined' ? window.location.pathname : '',
      authDomain: getEffectiveFirebaseConfig().authDomain,
    });

    let redirectResult;
    try {
      redirectResult = await consumeFirebaseRedirectResult(auth, consumer, {
        allowAuthStateFallback: true,
      });
    } catch (error) {
      socialAuthDebug('FIREBASE_REDIRECT_RESULT', { ok: false, code: error?.code, message: error?.message });
      throw error;
    }

    if (!redirectResult?.user) {
      const failure = describeRedirectRecoveryFailure({
        consumer,
        reason: 'redirect-result-null',
        authDomain: getEffectiveFirebaseConfig().authDomain,
        path: typeof window !== 'undefined' ? window.location.pathname : '',
        hasIntent: true,
        redirectConsumed: hasRedirectResultBeenConsumed(),
      });
      const err = new Error(failure);
      err.code = 'REDIRECT_RESULT_MISSING';
      throw err;
    }

    const options = {
      rememberMe: pending.rememberMe !== false,
      link: Boolean(pending.link),
    };

    try {
      const challenge = await prepareBackendChallenge(options);
      const user = await complete(redirectResult, {
        ...options,
        challenge,
      });
      return user;
    } finally {
      await signOut(auth).catch(() => {});
    }
  })().finally(() => {
    redirectRecoveryPromise = null;
  });

  return redirectRecoveryPromise;
}

/** Single authoritative redirect recovery entry (App bootstrap + callback UI). */
export function runGoogleRedirectRecovery(consumer = 'RedirectRecovery') {
  return bootstrapGoogleRedirectRecovery((label) => runGoogleRedirectRecoveryPipeline(label || consumer));
}

export async function awaitGoogleRedirectRecovery(consumer = 'RedirectRecovery') {
  const existing = await waitForGoogleRedirectRecovery();
  if (existing) {
    return existing;
  }
  const intent = peekRedirectIntent();
  if (!intent || intent.phase !== 'awaiting-google-return') {
    return null;
  }
  return runGoogleRedirectRecovery(consumer);
}

/** @deprecated */
export async function completeRedirectSignIn(consumer) {
  return awaitGoogleRedirectRecovery(consumer);
}

export function navigateAfterSocialLogin(user, { navigate, replaceDashboard = false } = {}) {
  if (!user?.email) return;
  const useHardNav = replaceDashboard || shouldPreferGoogleRedirectSignIn() || peekRedirectIntent();
  socialAuthDebug('DASHBOARD_REDIRECT', { replace: useHardNav });
  markFreshLogin();
  clearSocialRedirectIntent();
  if (useHardNav) {
    window.location.replace('/dashboard');
    return;
  }
  navigate?.('/dashboard', { replace: true, state: { user } });
}

export function isGoogleRedirectRecoveryPending() {
  const intent = peekRedirectIntent();
  return intent?.phase === 'awaiting-google-return';
}
