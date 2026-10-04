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
import { resolveGitHubSignInEmail } from './githubEmail.js';
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
    const provider = new GithubAuthProvider();
    provider.addScope('user:email');
    provider.addScope('read:user');
    return provider;
  }
  throw new Error('Unsupported provider.');
}

function isGitHubUser(result) {
  return result?.user?.providerData?.some((entry) => entry.providerId === 'github.com');
}

function githubAccessTokenFromCredential(credential) {
  return credential?.accessToken || null;
}

async function resolveGitHubSignInContext(result, credential) {
  const accessToken = githubAccessTokenFromCredential(credential)
    || (result ? GithubAuthProvider.credentialFromResult(result)?.accessToken : null);
  if (!accessToken) return { githubAccessToken: null, githubEmail: null };
  const githubEmail = await resolveGitHubSignInEmail(accessToken);
  return { githubAccessToken: accessToken, githubEmail };
}

async function complete(result, options) {
  const githubContext = options.githubAccessToken && options.githubEmail
    ? { githubAccessToken: options.githubAccessToken, githubEmail: options.githubEmail }
    : null;

  let exchangeExtras = { ...options };
  if (isGitHubUser(result)) {
    const resolved = githubContext || await resolveGitHubSignInContext(result);
    if (resolved.githubEmail) {
      exchangeExtras = { ...exchangeExtras, ...resolved };
    } else if (!result.user.email || !result.user.emailVerified) {
      throw Object.assign(
        new Error('GitHub did not share a verified email. Add and verify an email in GitHub Settings, then retry.'),
        { code: 'auth/missing-email' },
      );
    }
  }

  if (!isGitHubUser(result) && !result.user.emailVerified) {
    await sendEmailVerification(result.user);
    throw Object.assign(
      new Error('Verify your email with the provider, then try again.'),
      { code: 'auth/email-not-verified' },
    );
  }

  return exchangeSocialSession(await result.user.getIdToken(true), exchangeExtras);
}

async function completeGitHubAccessTokenOnly(options) {
  const accessToken = options.githubAccessToken;
  const githubEmail = options.githubEmail || await resolveGitHubSignInEmail(accessToken);
  return exchangeSocialSession(null, {
    ...options,
    githubAccessToken: accessToken,
    githubEmail,
  });
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

async function signInGitHubPopup(auth) {
  const provider = providerFor('GitHub');
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GithubAuthProvider.credentialFromResult(result);
    const context = await resolveGitHubSignInContext(result, credential);
    return { result, ...context };
  } catch (error) {
    if (error.code === 'auth/missing-email') {
      const credential = GithubAuthProvider.credentialFromError(error);
      const accessToken = githubAccessTokenFromCredential(credential);
      if (!accessToken) throw error;
      const githubEmail = await resolveGitHubSignInEmail(accessToken);
      try {
        const result = await signInWithCredential(auth, credential);
        return {
          result,
          githubAccessToken: accessToken,
          githubEmail,
        };
      } catch (retryError) {
        if (retryError.code === 'auth/missing-email') {
          return {
            githubOnly: true,
            githubAccessToken: accessToken,
            githubEmail,
          };
        }
        throw retryError;
      }
    }
    throw error;
  }
}

async function signInWithProvider(auth, name, options) {
  const provider = providerFor(name);
  if (isCapacitorNative()) {
    saveRedirectIntent(name, options);
    await signInWithRedirect(auth, provider);
    return { redirected: true };
  }
  try {
    if (name === 'GitHub') {
      return signInGitHubPopup(auth);
    }
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
    if (signInOutcome.githubOnly) {
      return await completeGitHubAccessTokenOnly({
        ...options,
        challenge,
        githubAccessToken: signInOutcome.githubAccessToken,
        githubEmail: signInOutcome.githubEmail,
      });
    }
    return await complete(signInOutcome.result, {
      ...options,
      challenge,
      githubAccessToken: signInOutcome.githubAccessToken,
      githubEmail: signInOutcome.githubEmail,
    });
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
  const pendingName = pending?.name;
  let githubAccessToken = null;
  let githubEmail = null;
  if (pendingName === 'GitHub') {
    const credential = GithubAuthProvider.credentialFromResult(redirectResult);
    const context = await resolveGitHubSignInContext(redirectResult, credential);
    githubAccessToken = context.githubAccessToken;
    githubEmail = context.githubEmail;
  }
  try {
    return await complete(redirectResult, {
      ...options,
      challenge,
      githubAccessToken,
      githubEmail,
    });
  } finally {
    await signOut(auth).catch(() => {});
  }
}
