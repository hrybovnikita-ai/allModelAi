import {
  GoogleAuthProvider,
  GithubAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithCredential,
  linkWithCredential,
  sendEmailVerification,
  signOut,
} from 'firebase/auth';
import { getFirebaseOAuthOrigin, getSocialAuth } from './firebase.js';
import { isCapacitorNative } from './apiBase.js';
import { exchangeSocialSession, prepareSocialSession } from './socialSession.js';
import { SOCIAL_PROVIDER_LABELS } from './socialProviders.js';

const REDIRECT_STORAGE_KEY = 'allmodelai_social_redirect';

let pendingLink = null;

export const SOCIAL_PROVIDERS = SOCIAL_PROVIDER_LABELS;

export function providerLabel(name) {
  return name;
}

function providerFor(name) {
  if (name === 'Google') {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return provider;
  }
  if (name === 'Apple') {
    const provider = new OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    return provider;
  }
  if (name === 'GitHub') {
    return new GithubAuthProvider();
  }
  throw new Error('Unsupported provider.');
}

async function complete(result, options) {
  if (!result.user.emailVerified) {
    await sendEmailVerification(result.user);
    throw Object.assign(
      new Error('Verify your email with the provider, then try again.'),
      { code: 'auth/email-not-verified' },
    );
  }
  return exchangeSocialSession(await result.user.getIdToken(true), options);
}

function saveRedirectIntent(name, options = {}) {
  sessionStorage.setItem(
    REDIRECT_STORAGE_KEY,
    JSON.stringify({
      name,
      rememberMe: options.rememberMe !== false,
      link: Boolean(options.link),
      expires: Date.now() + 600000,
    }),
  );
}

function readRedirectIntent() {
  try {
    const raw = sessionStorage.getItem(REDIRECT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.name || parsed.expires < Date.now()) {
      sessionStorage.removeItem(REDIRECT_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    sessionStorage.removeItem(REDIRECT_STORAGE_KEY);
    return null;
  }
}

export function clearSocialRedirectIntent() {
  sessionStorage.removeItem(REDIRECT_STORAGE_KEY);
}

export function cancelSocialLink() {
  pendingLink = null;
}

async function signInWithProvider(auth, name, options) {
  const provider = providerFor(name);
  if (isCapacitorNative()) {
    saveRedirectIntent(name, options);
    await signInWithRedirect(auth, provider);
    return { redirected: true };
  }
  try {
    const result = await signInWithPopup(auth, provider);
    return { result };
  } catch (error) {
    if (error.code === 'auth/popup-blocked') {
      saveRedirectIntent(name, options);
      await signInWithRedirect(auth, provider);
      return { redirected: true };
    }
    throw error;
  }
}

export async function socialSignIn(name, options = {}) {
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
    return await complete(signInOutcome.result, { ...options, challenge });
  } catch (error) {
    if (options?.link && error.code === 'auth/account-exists-with-different-credential') {
      const credential = name === 'Google'
        ? GoogleAuthProvider.credentialFromError(error)
        : name === 'GitHub'
          ? GithubAuthProvider.credentialFromError(error)
          : OAuthProvider.credentialFromError(error);
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

/**
 * Completes Firebase redirect sign-in (popup blocked or Capacitor WebView).
 */
export async function completeSocialRedirect() {
  const auth = getSocialAuth();
  const pending = readRedirectIntent();
  const redirectResult = await getRedirectResult(auth).catch(() => null);
  clearSocialRedirectIntent();

  if (!redirectResult?.user) {
    return null;
  }

  const options = {
    rememberMe: pending?.rememberMe !== false,
    link: Boolean(pending?.link),
  };
  const challenge = await prepareSocialSession(options);
  try {
    return await complete(redirectResult, { ...options, challenge });
  } finally {
    await signOut(auth).catch(() => {});
  }
}
