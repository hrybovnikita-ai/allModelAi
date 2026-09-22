import { GoogleAuthProvider, FacebookAuthProvider, OAuthProvider, signInWithPopup, signInWithCredential, linkWithCredential, sendEmailVerification, signOut } from 'firebase/auth';
import { getSocialAuth } from './firebase.js';
import { exchangeSocialSession, prepareSocialSession } from './socialSession.js';

let pendingLink = null;
function providerFor(name) {
  if (name === 'Google') {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return provider;
  }
  if (name === 'Apple') {
    const provider = new OAuthProvider('apple.com');
    provider.addScope('email'); provider.addScope('name');
    return provider;
  }
  if (name === 'Facebook') {
    const provider = new FacebookAuthProvider();
    provider.addScope('email');
    return provider;
  }
  throw new Error('Unsupported provider.');
}
async function complete(result, options) {
  if (!result.user.emailVerified) {
    await sendEmailVerification(result.user);
    throw new Error('A verification email has been sent. Open its link, then retry this provider. No AllModelAI account has been changed.');
  }
  return exchangeSocialSession(await result.user.getIdToken(true), options);
}
export function cancelSocialLink() { pendingLink = null; }
export async function socialSignIn(name, options) {
  const auth = getSocialAuth();
  pendingLink = null;
  const challengePromise = prepareSocialSession(options);
  try {
    // No network awaits before this popup, preserving the user's mobile click activation.
    const [result, challenge] = await Promise.all([signInWithPopup(auth, providerFor(name)), challengePromise]);
    return await complete(result, { ...options, challenge });
  } catch (error) {
    if (options?.link && error.code === 'auth/account-exists-with-different-credential') {
      const credential = name === 'Google' ? GoogleAuthProvider.credentialFromError(error)
        : name === 'Facebook' ? FacebookAuthProvider.credentialFromError(error) : OAuthProvider.credentialFromError(error);
      if (credential) pendingLink = { credential, options, challengePromise, expires: Date.now() + 300000 };
    }
    throw error;
  } finally {
    await signOut(auth).catch(() => {});
  }
}
export async function finishSocialLink(existingProvider) {
  if (!pendingLink || pendingLink.expires < Date.now()) throw new Error('Linking expired. Select the provider again.');
  const pending = pendingLink;
  pendingLink = null;
  const auth = getSocialAuth();
  try {
    // A new explicit click proves ownership of the existing Firebase identity too.
    const [original, challenge] = await Promise.all([signInWithPopup(auth, providerFor(existingProvider)), pending.challengePromise]);
    await linkWithCredential(original.user, pending.credential);
    // Issue a token whose sign_in_provider is the newly proven provider, not the original one.
    const result = await signInWithCredential(auth, pending.credential);
    return await complete(result, { ...pending.options, challenge });
  } finally { await signOut(auth).catch(() => {}); }
}
