#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const backendEnvPath = path.join(__dirname, '..', '.env');
const frontendEnvPath = path.join(__dirname, '..', '..', 'frontend', '.env');
const keyName = 'STRIPE_PUBLISHABLE_KEY';
const viteKey = 'VITE_STRIPE_PUBLISHABLE_KEY';

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

const publishable = readEnvValue(backendEnvPath, keyName);
if (!publishable) {
    console.error(`Set ${keyName} in backend/.env first (pk_test_... from Stripe Dashboard).`);
    process.exit(1);
}

upsertEnvLine(frontendEnvPath, viteKey, publishable);
console.log(`Copied ${keyName} → frontend/.env as ${viteKey}`);
