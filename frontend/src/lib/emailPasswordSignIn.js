import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { authPost } from './authApi.js';
import { ensureSocialAuthReady, isFirebaseSocialConfigured } from './firebase.js';
import { stashFirebaseIdToken } from './firebaseSessionFallback.js';
import { exchangeSocialSession, prepareSocialSession } from './socialSession.js';
import { socialAuthDebug } from './socialAuthDiagnostics.js';

function providersFromError(backendError) {
  const providers = backendError?.data?.providers;
  return Array.isArray(providers) ? providers : [];
}

function isGoogleOnlyPasswordSetup(backendError) {
  if (backendError?.code !== 'PASSWORD_SETUP_REQUIRED') {
    return false;
  }
  const providers = providersFromError(backendError);
  return providers.includes('google.com') || providers.includes('google');
}

function shouldAttemptFirebaseEmailFallback(backendError) {
  if (!backendError || backendError.status !== 401) {
    return false;
  }
  // Backend already proved this row has no password_hash and only a Google identity.
  // accounts:signInWithPassword then returns HTTP 400 INVALID_LOGIN_CREDENTIALS.
  // Do not call Identity Toolkit until the account owner sets a password.
  if (isGoogleOnlyPasswordSetup(backendError)) {
    return false;
  }
  if (backendError.code === 'PASSWORD_SETUP_REQUIRED') {
    return true;
  }
  if (backendError.code === 'INVALID_CREDENTIALS') {
    return true;
  }
  const reason = backendError.data?.debugReason;
  return reason === 'PASSWORD_HASH_MISSING' || reason === 'PASSWORD_HASH_INVALID';
}

/**
 * Email/password sign-in: AllModelAI backend first, then Firebase Email/Password + session exchange
 * when the backend row is missing a password hash or Firebase holds the canonical credential.
 */
export async function signInWithEmailPasswordAllModelAI({ email, password, rememberMe = true }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  try {
    const result = await authPost('login', {
      email: normalizedEmail,
      password,
      rememberMe,
    });
    return { channel: 'backend', ...result };
  } catch (backendError) {
    if (backendError.code === 'PASSWORD_SETUP_REQUIRED') {
      socialAuthDebug('EMAIL_LOGIN_PASSWORD_SETUP_REQUIRED', {
        providers: providersFromError(backendError),
        googleLinked: isGoogleOnlyPasswordSetup(backendError),
      });
    }

    if (!shouldAttemptFirebaseEmailFallback(backendError) || !isFirebaseSocialConfigured()) {
      throw backendError;
    }

    socialAuthDebug('EMAIL_LOGIN_BACKEND_FALLBACK_FIREBASE', {
      code: backendError.code,
      debugReason: backendError.data?.debugReason,
    });

    let auth;
    try {
      auth = await ensureSocialAuthReady();
      await signInWithEmailAndPassword(auth, normalizedEmail, password);
    } catch {
      if (backendError.code === 'PASSWORD_SETUP_REQUIRED') {
        throw backendError;
      }
      throw backendError.code === 'INVALID_CREDENTIALS'
        ? backendError
        : Object.assign(new Error('Incorrect email or password.'), {
          code: 'INVALID_CREDENTIALS',
          status: 401,
        });
    }

    const firebaseUser = auth.currentUser;
    if (!firebaseUser?.emailVerified) {
      await signOut(auth).catch(() => {});
      throw Object.assign(new Error('Verify your email before signing in.'), {
        code: 'EMAIL_NOT_VERIFIED',
        status: 403,
      });
    }

    try {
      const idToken = await firebaseUser.getIdToken(true);
      stashFirebaseIdToken(idToken);
      const challenge = await prepareSocialSession({ link: false });
      const user = await exchangeSocialSession(idToken, {
        rememberMe,
        challenge,
      });
      return { channel: 'firebase', data: { user, message: 'Signed in successfully' }, user };
    } finally {
      await signOut(auth).catch(() => {});
    }
  }
}
