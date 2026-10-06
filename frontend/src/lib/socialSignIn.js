import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signInWithCredential,
  linkWithCredential,
  sendEmailVerification,
  signOut,
} from 'firebase/auth';
import { ensureSocialAuthReady, getEffectiveFirebaseConfig, getFirebaseOAuthOrigin, getSocialAuth } from './firebase.js';
import { isCapacitorNative, prefersSameOriginApi } from './apiBase.js';
import { markFreshLogin, rememberSession } from './session.js';
import { exchangeSocialSession, prepareSocialSession } from './socialSession.js';
import { SOCIAL_PROVIDER_LABELS } from './socialProviders.js';
import { authLog, describeRedirectRecoveryFailure, socialAuthDebug } from './socialAuthDiagnostics.js';
import { stashFirebaseIdToken } from './firebaseSessionFallback.js';
import {
  isMobileWebSafari,
  shouldPreferGoogleRedirectSignIn,
  shouldTryGooglePopupFirst,
} from './socialSignInEnv.js';
import { consumeFirebaseRedirectResult, hasRedirectResultBeenConsumed } from './firebaseRedirectCoordinator.js';
import { bootstrapGoogleRedirectRecovery, waitForGoogleRedirectRecovery } from './googleRedirectRecovery.js';
import {
  clearSocialRedirectIntent,
  isGoogleRedirectRecoveryPending,
  isRedirectFlowCommitted,
  markRedirectFlowCommitted,
  peekRedirectIntent,
  persistRedirectIntent,
  reconcileStaleRedirectIntent,
} from './socialRedirectState.js';
import { assertGoogleRedirectStorageAvailable } from './storageAvailability.js';

export {
  clearSocialRedirectIntent,
  isGoogleRedirectRecoveryPending,
  peekRedirectIntent,
  reconcileStaleRedirectIntent,
} from './socialRedirectState.js';

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
    const idToken = await firebaseUser.getIdToken(true);
    stashFirebaseIdToken(idToken);
    authLog('Firebase ID token ready for session exchange');
    const user = await exchangeSocialSession(idToken, options);
    socialAuthDebug('BACKEND_SESSION_EXCHANGE_SUCCESS', { email: user?.email });
    socialAuthDebug('BACKEND_SET_SESSION_COMPLETE', { email: user?.email });
    return user;
  } catch (error) {
    socialAuthDebug('BACKEND_SESSION_EXCHANGE_FAILED', { code: error.code, message: error.message });
    throw error;
  }
}

async function complete(result, options) {
  return completeFromFirebaseUser(result.user, options);
}

export function readRedirectIntent() {
  return peekRedirectIntent();
}

export function cancelSocialLink() {
  pendingLink = null;
}

function shouldUseRedirectSignInFirst() {
  return isCapacitorNative() || shouldPreferGoogleRedirectSignIn();
}

export async function startGoogleRedirectSignIn(name, options = {}, reason = 'ios-safari') {
  await ensureSocialAuthReady();
  const auth = getSocialAuth();
  return beginRedirectSignIn(auth, name, options, reason);
}

async function beginRedirectSignIn(auth, name, options, reason) {
  assertGoogleRedirectStorageAvailable();
  socialAuthDebug('GOOGLE_AUTH_START', {
    path: typeof window !== 'undefined' ? window.location.pathname : '',
    mobileSafari: isMobileWebSafari(),
    reason,
  });
  persistRedirectIntent(name, options, 'preparing');
  const challenge = await prepareBackendChallenge(options);
  persistRedirectIntent(name, { ...options, challengeState: challenge?.state }, 'awaiting-google-return');
  socialAuthDebug('GOOGLE_AUTH_STRATEGY', { mode: 'redirect', reason });
  socialAuthDebug('FIREBASE_REDIRECT_START', {
    path: typeof window !== 'undefined' ? window.location.pathname : '',
    authDomain: getEffectiveFirebaseConfig().authDomain,
    reason,
  });
  markRedirectFlowCommitted();
  authLog('Redirect flow committed — starting signInWithRedirect', { reason });
  await signInWithRedirect(auth, providerFor(name));
  return { redirected: true };
}

/**
 * Call synchronously inside the click handler (no await before this).
 * Requires ensureSocialAuthReady() to have completed during app/login mount.
 */
export function launchGooglePopupSignIn() {
  if (shouldPreferGoogleRedirectSignIn()) {
    throw Object.assign(new Error('Use redirect sign-in on this device.'), { code: 'auth/redirect-required' });
  }
  reconcileStaleRedirectIntent();
  clearSocialRedirectIntent();
  if (typeof window !== 'undefined' && !getFirebaseOAuthOrigin()) {
    throw new Error('Sign-in requires a browser origin. Open AllModelAI from your site URL, not a file:// link.');
  }
  const auth = getSocialAuth();
  const provider = providerFor(GOOGLE_PROVIDER);
  socialAuthDebug('GOOGLE_AUTH_START', {
    path: typeof window !== 'undefined' ? window.location.pathname : '',
    mobileSafari: isMobileWebSafari(),
    syncLaunch: true,
  });
  socialAuthDebug('GOOGLE_AUTH_STRATEGY', { mode: 'popup', syncLaunch: true });
  authLog('Launching popup synchronously (preserving Safari user activation)');
  const popupPromise = signInWithPopup(auth, provider);
  return { auth, popupPromise };
}

export async function completeGooglePopupSignIn(auth, popupPromise, name, options = {}) {
  if (name !== GOOGLE_PROVIDER) {
    throw new Error('Only Google sign-in is available.');
  }
  pendingLink = null;
  let redirected = false;
  try {
    if (shouldUseRedirectSignInFirst()) {
      redirected = true;
      return beginRedirectSignIn(auth, name, options, 'capacitor-native');
    }
    if (!shouldTryGooglePopupFirst()) {
      redirected = true;
      return beginRedirectSignIn(auth, name, options, 'popup-unavailable');
    }
    const result = await popupPromise;
    authLog('Popup sign-in resolved');
    const challenge = await prepareBackendChallenge(options);
    return await complete(result, { ...options, challenge });
  } catch (error) {
    if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request') {
      redirected = true;
      return beginRedirectSignIn(auth, name, options, error.code);
    }
    throw error;
  } finally {
    if (!redirected && !peekRedirectIntent()) {
      await signOut(auth).catch(() => {});
    }
  }
}

export function isAuthCallbackRoute(pathname = typeof window !== 'undefined' ? window.location.pathname : '') {
  return String(pathname || '').startsWith('/auth/');
}

export async function socialSignIn(name, options = {}) {
  await ensureSocialAuthReady();
  if (shouldUseRedirectSignInFirst() || !shouldTryGooglePopupFirst()) {
    const auth = getSocialAuth();
    return beginRedirectSignIn(auth, name, options, shouldUseRedirectSignInFirst() ? 'capacitor-native' : 'popup-unavailable');
  }
  const { auth, popupPromise } = launchGooglePopupSignIn();
  let signInOutcome = null;
  try {
    signInOutcome = await completeGooglePopupSignIn(auth, popupPromise, name, options);
    if (signInOutcome?.redirected) {
      return { redirected: true };
    }
    return signInOutcome;
  } catch (error) {
    socialAuthDebug('GOOGLE_AUTH_FAILED', {
      code: error?.code,
      message: error?.message,
      status: error?.status,
      strategy: signInOutcome?.redirected ? 'redirect' : 'popup',
    });
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
    if (!pending || pending.phase !== 'awaiting-google-return' || !isRedirectFlowCommitted()) {
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
      clearSocialRedirectIntent();
      socialAuthDebug('FIREBASE_REDIRECT_RESULT', { ok: false, code: error?.code, message: error?.message });
      throw error;
    }

    if (!redirectResult?.user) {
      clearSocialRedirectIntent();
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
      clearSocialRedirectIntent();
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
  if (!isGoogleRedirectRecoveryPending()) {
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
  markFreshLogin();
  rememberSession(user);
  clearSocialRedirectIntent();

  const useSpaNav = prefersSameOriginApi() && typeof navigate === 'function';
  if (useSpaNav) {
    socialAuthDebug('DASHBOARD_REDIRECT', { mode: 'spa', pathname: '/dashboard' });
    navigate('/dashboard', { replace: true, state: { user } });
    return;
  }

  const useHardNav = replaceDashboard || peekRedirectIntent();
  socialAuthDebug('DASHBOARD_REDIRECT', { mode: 'hard', replace: useHardNav });
  if (useHardNav) {
    window.location.replace('/dashboard');
    return;
  }
  navigate?.('/dashboard', { replace: true, state: { user } });
}

