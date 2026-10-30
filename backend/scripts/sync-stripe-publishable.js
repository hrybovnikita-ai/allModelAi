#!/usr/bin/env node
/**
 * Sync Stripe publishable key between backend/.env and frontend/.env.
 * Finds pk_test_/pk_live_ in STRIPE_PUBLISHABLE_KEY, VITE_STRIPE_PUBLISHABLE_KEY,
 * or misnamed STRIPE_API_KEY (when it is a publishable key, not sk_*).
 */
const fs = require('node:fs');
const path = require('node:path');

const backendEnvPath = path.join(__dirname, '..', '.env');
const frontendEnvPath = path.join(__dirname, '..', '..', 'frontend', '.env');
const BACKEND_KEY = 'STRIPE_PUBLISHABLE_KEY';
const FRONTEND_KEY = 'VITE_STRIPE_PUBLISHABLE_KEY';

const readEnvValue = (filePath, name) => {
    if (!fs.existsSync(filePath)) return '';
    const line = fs.readFileSync(filePath, 'utf8')
        .split(/\r?\n/)
        .find((row) => row.startsWith(`${name}=`));
    if (!line) return '';
    return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, '');
};

const upsertEnvLine = (filePath, name, value) => {
    const eol = '\n';
    let text = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    if (text.length && !text.endsWith('\n')) text += eol;
    const pattern = new RegExp(`^${name}=.*$`, 'm');
    const line = `${name}=${value}`;
    text = pattern.test(text) ? text.replace(pattern, line) : `${text}${line}${eol}`;
    fs.writeFileSync(filePath, text, 'utf8');
};

const isPublishable = (value) => {
    const key = String(value || '').trim();
    return key.startsWith('pk_test_') || key.startsWith('pk_live_');
};

const findPublishableKey = () => {
    const candidates = [
        readEnvValue(backendEnvPath, BACKEND_KEY),
        readEnvValue(frontendEnvPath, FRONTEND_KEY),
        readEnvValue(frontendEnvPath, 'STRIPE_API_KEY'),
        readEnvValue(backendEnvPath, 'STRIPE_API_KEY'),
        readEnvValue(backendEnvPath, 'VITE_STRIPE_PUBLISHABLE_KEY'),
    ];
    return candidates.find(isPublishable) || '';
};

const publishable = findPublishableKey();
if (!publishable) {
    console.error(
        'No Stripe publishable key found. Set STRIPE_PUBLISHABLE_KEY=pk_test_... in backend/.env '
        + '(Stripe Dashboard → Developers → API keys), then re-run: npm run stripe:sync',
    );
    process.exit(1);
}

upsertEnvLine(backendEnvPath, BACKEND_KEY, publishable);
upsertEnvLine(frontendEnvPath, FRONTEND_KEY, publishable);
console.log(`Synced Stripe publishable key to ${BACKEND_KEY} (backend) and ${FRONTEND_KEY} (frontend).`);
console.log('Restart the backend and Vite dev server if they are already running.');
