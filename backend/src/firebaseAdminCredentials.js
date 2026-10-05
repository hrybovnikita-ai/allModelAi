const fs = require('fs');
const path = require('path');

const DEFAULT_SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'secrets', 'firebase-service-account.json');

let resolvedCredentialsCache = null;
let resolveAttempted = false;

function normalizePrivateKey(raw) {
    if (raw == null || raw === '') return '';
    let key = String(raw).trim();
    if (
        (key.startsWith('"') && key.endsWith('"'))
        || (key.startsWith("'") && key.endsWith("'"))
    ) {
        key = key.slice(1, -1).trim();
    }
    return key.replace(/\\n/g, '\n');
}

function readFirebaseCredentialsFromEnv() {
    const projectId = String(process.env.FIREBASE_PROJECT_ID || '').trim();
    const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL || '').trim();
    const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);
    return { projectId, clientEmail, privateKey };
}

function isCompleteCredentialSet({ projectId, clientEmail, privateKey }) {
    return Boolean(projectId && clientEmail && privateKey);
}

function preferEnvCredentialsInCurrentEnvironment() {
    if (process.env.FIREBASE_CREDENTIALS_SOURCE === 'env') return true;
    if (process.env.FIREBASE_CREDENTIALS_SOURCE === 'file') return false;
    return process.env.NODE_ENV === 'production';
}

function allowLocalServiceAccountFileFallback() {
    if (process.env.FIREBASE_CREDENTIALS_SOURCE === 'file') return true;
    if (process.env.FIREBASE_CREDENTIALS_SOURCE === 'env') return false;
    if (process.env.NODE_ENV === 'production') return false;
    if (process.env.NODE_ENV === 'test') {
        return process.env.FIREBASE_ALLOW_SERVICE_ACCOUNT_FILE === 'true';
    }
    return true;
}

function getServiceAccountFilePath() {
    const configured = String(process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '').trim();
    if (configured) {
        return path.isAbsolute(configured)
            ? configured
            : path.resolve(process.cwd(), configured);
    }
    return DEFAULT_SERVICE_ACCOUNT_PATH;
}

function readFirebaseCredentialsFromServiceAccountFile(filePath) {
    if (!filePath) return null;
    let stat;
    try {
        stat = fs.statSync(filePath);
    } catch {
        return null;
    }
    if (!stat.isFile()) return null;

    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const projectId = String(parsed.project_id || '').trim();
        const clientEmail = String(parsed.client_email || '').trim();
        const privateKey = normalizePrivateKey(parsed.private_key);
        if (!isCompleteCredentialSet({ projectId, clientEmail, privateKey })) {
            console.error('[AUTH] Firebase Admin: service account file is missing required fields.');
            return null;
        }
        return {
            projectId,
            clientEmail,
            privateKey,
            source: 'file',
            serviceAccountPath: filePath,
        };
    } catch {
        console.error('[AUTH] Firebase Admin: service account file could not be parsed.');
        return null;
    }
}

function resolveFirebaseAdminCredentials() {
    if (resolveAttempted) {
        return resolvedCredentialsCache;
    }
    resolveAttempted = true;

    const fromEnv = readFirebaseCredentialsFromEnv();
    if (isCompleteCredentialSet(fromEnv)) {
        resolvedCredentialsCache = { ...fromEnv, source: 'env' };
        return resolvedCredentialsCache;
    }

    if (preferEnvCredentialsInCurrentEnvironment() || !allowLocalServiceAccountFileFallback()) {
        resolvedCredentialsCache = null;
        return null;
    }

    const filePath = getServiceAccountFilePath();
    const fromFile = readFirebaseCredentialsFromServiceAccountFile(filePath);
    if (fromFile) {
        resolvedCredentialsCache = fromFile;
        return resolvedCredentialsCache;
    }

    resolvedCredentialsCache = null;
    return null;
}

function isFirebaseAdminConfigured() {
    return resolveFirebaseAdminCredentials() !== null;
}

function resetFirebaseAdminCredentialsForTests() {
    resolvedCredentialsCache = null;
    resolveAttempted = false;
}

function describeMissingFirebaseAdminConfig() {
    if (preferEnvCredentialsInCurrentEnvironment()) {
        return 'Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY for production.';
    }
    return 'Set FIREBASE_* environment variables or place a service account JSON at backend/secrets/firebase-service-account.json for local development.';
}

module.exports = {
    normalizePrivateKey,
    readFirebaseCredentialsFromEnv,
    resolveFirebaseAdminCredentials,
    isFirebaseAdminConfigured,
    resetFirebaseAdminCredentialsForTests,
    describeMissingFirebaseAdminConfig,
    getServiceAccountFilePath,
    DEFAULT_SERVICE_ACCOUNT_PATH,
};
