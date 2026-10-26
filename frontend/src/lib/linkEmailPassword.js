import {
  EmailAuthProvider,
  GoogleAuthProvider,
  fetchSignInMethodsForEmail,
  linkWithCredential,
  reauthenticateWithPopup,
} from 'firebase/auth';
import { ensureSocialAuthReady, isFirebaseSocialConfigured } from './firebase.js';
import { socialAuthDebug } from './socialAuthDiagnostics.js';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isBenignLinkError(error) {
  const code = error?.code;
  return code === 'auth/provider-already-linked'
    || code === 'auth/credential-already-in-use'
    || code === 'auth/email-already-in-use';
}

/**
 * Link Email/Password to the currently signed-in Firebase user (typically after Google).
 * Call only after the user explicitly submits Settings → Security.
 * Does not persist the password in storage, URLs, or logs.
 */
export async function linkEmailPasswordToCurrentFirebaseUser(email, password) {
  if (!isFirebaseSocialConfigured()) {
    return { linked: false, reason: 'firebase-unconfigured' };
  }
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !password) {
    return { linked: false, reason: 'missing-input' };
  }
  const auth = await ensureSocialAuthReady();
  const currentUser = auth.currentUser;
  if (!currentUser?.email || normalizeEmail(currentUser.email) !== normalizedEmail) {
    socialAuthDebug('FIREBASE_EMAIL_PASSWORD_LINK_SKIPPED', { reason: 'firebase-user-mismatch' });
    return { linked: false, reason: 'firebase-user-mismatch' };
  }
  try {
    const methods = await fetchSignInMethodsForEmail(auth, normalizedEmail).catch(() => []);
    if (Array.isArray(methods) && methods.includes('password')) {
      return { linked: true, reason: 'already-linked' };
    }
    const credential = EmailAuthProvider.credential(normalizedEmail, password);
    try {
      await linkWithCredential(currentUser, credential);
    } catch (linkError) {
      if (linkError?.code !== 'auth/requires-recent-login') {
        throw linkError;
      }
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await reauthenticateWithPopup(currentUser, provider);
      const refreshed = auth.currentUser;
      if (!refreshed || normalizeEmail(refreshed.email) !== normalizedEmail) {
        return { linked: false, reason: 'firebase-user-mismatch' };
      }
      await linkWithCredential(refreshed, credential);
    }
    socialAuthDebug('FIREBASE_EMAIL_PASSWORD_LINKED', {});
    return { linked: true, reason: 'linked' };
  } catch (error) {
    if (error?.code === 'auth/credential-already-in-use' || error?.code === 'auth/email-already-in-use') {
      socialAuthDebug('FIREBASE_EMAIL_PASSWORD_LINK_CONFLICT', { code: error.code });
      return { linked: false, reason: error.code };
    }
    if (isBenignLinkError(error)) {
      socialAuthDebug('FIREBASE_EMAIL_PASSWORD_ALREADY_LINKED', { code: error.code });
      return { linked: true, reason: error.code };
    }
    socialAuthDebug('FIREBASE_EMAIL_PASSWORD_LINK_FAILED', { code: error?.code });
    return { linked: false, reason: error?.code || 'link-failed' };
  }
}
