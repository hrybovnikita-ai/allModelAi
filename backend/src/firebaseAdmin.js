const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const {
    normalizePrivateKey,
    resolveFirebaseAdminCredentials,
    isFirebaseAdminConfigured,
    resetFirebaseAdminCredentialsForTests,
    describeMissingFirebaseAdminConfig,
} = require('./firebaseAdminCredentials');

const APP_NAME = 'allmodelai-social';

let authInstance = null;
let initAttempted = false;
let initError = null;

function logFirebaseAdminReady(source) {
    if (source === 'env') {
        console.log('[AUTH] Firebase Admin SDK ready (credentials from environment variables).');
        return;
    }
    if (source === 'file') {
        console.log('[AUTH] Firebase Admin SDK ready (credentials from local service account file).');
    }
}

function ensureFirebaseAuth() {
    if (authInstance) return authInstance;
    if (initError) throw initError;

    if (initAttempted) {
        const err = new Error('Firebase Admin is unavailable after a previous initialization failure.');
        err.status = 503;
        err.code = 'FIREBASE_ADMIN_UNAVAILABLE';
        throw err;
    }
    initAttempted = true;

    if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
        const err = new Error('Social sign-in is not configured on the server.');
        err.status = 503;
        err.code = 'FIREBASE_EMULATOR_ENABLED';
        initError = err;
        throw err;
    }

    const credentials = resolveFirebaseAdminCredentials();
    if (!credentials) {
        console.error(`[AUTH] Firebase Admin is not configured. ${describeMissingFirebaseAdminConfig()}`);
        const err = new Error('Social sign-in is not configured on the server.');
        err.status = 503;
        err.code = 'FIREBASE_NOT_CONFIGURED';
        initError = err;
        throw err;
    }

    const { projectId, clientEmail, privateKey, source } = credentials;
    if (!privateKey.includes('BEGIN PRIVATE KEY')) {
        console.error('[AUTH] Firebase Admin initialization failed: private key is missing PEM headers');
        const err = new Error('Social sign-in is unavailable. Check Firebase Admin credentials on the server.');
        err.status = 503;
        err.code = 'FIREBASE_INVALID_PRIVATE_KEY';
        initError = err;
        throw err;
    }

    try {
        let app = getApps().find((item) => item.name === APP_NAME);
        if (!app) {
            app = initializeApp({
                credential: cert({
                    projectId,
                    clientEmail,
                    privateKey,
                }),
            }, APP_NAME);
        }
        authInstance = getAuth(app);
        logFirebaseAdminReady(source);
        return authInstance;
    } catch (error) {
        console.error('[AUTH] Firebase Admin initialization failed:', error.message);
        const err = new Error('Social sign-in is unavailable. Check Firebase Admin credentials on the server.');
        err.status = 503;
        err.code = 'FIREBASE_ADMIN_INIT_FAILED';
        initError = err;
        throw err;
    }
}

async function verifySocialToken(token) {
    const idToken = typeof token === 'string' ? token.trim() : '';
    if (!idToken) {
        const err = new Error('Firebase ID token is required.');
        err.code = 'auth/argument-error';
        throw err;
    }
    try {
        return await ensureFirebaseAuth().verifyIdToken(idToken, true);
    } catch (error) {
        if (error.code?.startsWith('auth/')) {
            console.error('[AUTH] Firebase verifyIdToken failed:', error.code, error.message);
        } else if (!error.status) {
            console.error('[AUTH] Firebase verifyIdToken failed:', error.code || 'UNKNOWN', error.message);
        }
        throw error;
    }
}

/** Warm Admin SDK at startup so misconfigured keys surface in Render logs early. */
function warmFirebaseAdmin() {
    if (!isFirebaseAdminConfigured()) return false;
    try {
        ensureFirebaseAuth();
        return true;
    } catch {
        return false;
    }
}

function resetFirebaseAdminForTests() {
    authInstance = null;
    initAttempted = false;
    initError = null;
    resetFirebaseAdminCredentialsForTests();
}

module.exports = {
    verifySocialToken,
    isFirebaseAdminConfigured,
    normalizePrivateKey,
    warmFirebaseAdmin,
    resetFirebaseAdminForTests,
};
