import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { ensureSocialAuthReady, isFirebaseSocialConfigured } from './firebase.js';
import { socialAuthDebug } from './socialAuthDiagnostics.js';

/**
 * Mirror a successful backend email registration into Firebase Auth (same email/password).
 * Failures are non-fatal — backend remains the source of truth for the AllModelAI session.
 */
export async function syncFirebaseEmailAccountAfterRegister(email, password) {
  if (!isFirebaseSocialConfigured()) {
    return;
  }
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !password) {
    return;
  }

  let auth;
  try {
    auth = await ensureSocialAuthReady();
    const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
    if (credential.user) {
      await sendEmailVerification(credential.user).catch(() => {});
    }
    socialAuthDebug('FIREBASE_EMAIL_USER_CREATED', { email: normalizedEmail });
  } catch (error) {
    if (error?.code === 'auth/email-already-in-use') {
      try {
        await signInWithEmailAndPassword(auth, normalizedEmail, password);
        socialAuthDebug('FIREBASE_EMAIL_USER_EXISTS_SIGNED_IN', { email: normalizedEmail });
      } catch {
        socialAuthDebug('FIREBASE_EMAIL_MIRROR_SKIPPED', { code: error?.code });
      }
    } else {
      socialAuthDebug('FIREBASE_EMAIL_MIRROR_FAILED', { code: error?.code });
    }
  } finally {
    if (auth) {
      await signOut(auth).catch(() => {});
    }
  }
}
