const { initializeApp, getApps, cert, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

function firebaseAuth() {
    if (!process.env.FIREBASE_PROJECT_ID || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
        const error = new Error('Social sign-in is not configured on the server.');
        error.status = 503;
        throw error;
    }
    let app = getApps().find(item => item.name === 'allmodelai-social');
    if (!app) {
        const credentials = process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY
            ? cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') })
            : applicationDefault();
        app = initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID, credential: credentials }, 'allmodelai-social');
    }
    return getAuth(app);
}

async function verifySocialToken(token) {
    // Admin SDK verifies signature, issuer, audience, expiry, revocation and disabled users.
    return firebaseAuth().verifyIdToken(token, true);
}
module.exports = { verifySocialToken };
