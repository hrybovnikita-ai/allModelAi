/**
 * Safely set ZILLIZ_URI in backend/.env from the Windows clipboard,
 * or via interactive paste fallback.
 *
 * Usage (from backend/):
 *   node scripts/set-zilliz-uri-from-clipboard.js
 *   node scripts/set-zilliz-uri-from-clipboard.js --interactive
 *
 * Never prints the full endpoint, clipboard body, passwords, or tokens.
 */
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { execFileSync } = require('node:child_process');
const {
    normalizeZillizEndpoint,
    hostHint,
    upsertZillizUri,
    diagnoseClipboardText,
} = require('../src/services/zilliz/zillizEndpoint');

const envPath = path.join(__dirname, '..', '.env');

function readClipboardAttempts() {
    const attempts = [
        {
            label: 'Get-Clipboard -Raw',
            command: 'powershell.exe',
            args: ['-NoProfile', '-Command', '[Console]::OutputEncoding = [Text.UTF8Encoding]::UTF8; Get-Clipboard -Raw'],
        },
        {
            label: 'Get-Clipboard',
            command: 'powershell.exe',
            args: ['-NoProfile', '-Command', '(Get-Clipboard | Out-String).Trim()'],
        },
        {
            label: 'Windows.Forms clipboard',
            command: 'powershell.exe',
            args: [
                '-NoProfile',
                '-Command',
                "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::GetText()",
            ],
        },
    ];

    const errors = [];
    for (const attempt of attempts) {
        try {
            const text = execFileSync(attempt.command, attempt.args, {
                encoding: 'utf8',
                windowsHide: true,
                timeout: 8000,
                maxBuffer: 2 * 1024 * 1024,
            });
            const value = String(text || '').replace(/^\uFEFF/, '');
            if (value.trim()) {
                return { ok: true, text: value, source: attempt.label };
            }
            errors.push(`${attempt.label}: empty`);
        } catch (error) {
            errors.push(`${attempt.label}: ${String(error.message || error).slice(0, 120)}`);
        }
    }
    return { ok: false, errors };
}

function promptEndpointInteractively() {
    return new Promise((resolve, reject) => {
        if (!process.stdin.isTTY) {
            reject(new Error('Interactive paste requires a TTY terminal.'));
            return;
        }
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        console.log('Paste the Zilliz Public Endpoint, then press Enter.');
        console.log('(Input is accepted as one line; the value will not be echoed back.)');
        rl.question('ZILLIZ_URI> ', (answer) => {
            rl.close();
            resolve(String(answer || ''));
        });
    });
}

function writeUri(endpoint) {
    if (!fs.existsSync(envPath)) {
        throw new Error('backend/.env not found');
    }
    const before = fs.readFileSync(envPath, 'utf8');
    const after = upsertZillizUri(before, endpoint);
    fs.writeFileSync(envPath, after, 'utf8');
}

async function resolveEndpointFromClipboardOrPrompt({ forceInteractive = false } = {}) {
    if (!forceInteractive) {
        const clip = readClipboardAttempts();
        if (clip.ok) {
            const parsed = normalizeZillizEndpoint(clip.text, {
                sourceLabel: 'Clipboard',
                allowExtract: true,
            });
            if (parsed.ok) {
                return {
                    endpoint: parsed.value,
                    via: `clipboard:${clip.source}`,
                    extracted: Boolean(parsed.extracted),
                };
            }
            console.error(parsed.reason);
            console.error('Falling back to interactive paste…');
        } else {
            console.error('Clipboard access failed.');
            console.error('Falling back to interactive paste…');
        }
    }

    const pasted = await promptEndpointInteractively();
    const parsed = normalizeZillizEndpoint(pasted, {
        sourceLabel: 'Pasted value',
        allowExtract: true,
    });
    if (!parsed.ok) {
        const err = new Error(parsed.reason);
        err.code = 'ZILLIZ_ENDPOINT_INVALID';
        throw err;
    }
    return {
        endpoint: parsed.value,
        via: 'interactive',
        extracted: Boolean(parsed.extracted),
    };
}

async function main() {
    const forceInteractive = process.argv.includes('--interactive')
        || process.argv.includes('-i');
    const diagnoseOnly = process.argv.includes('--diagnose');

    if (diagnoseOnly) {
        const clip = readClipboardAttempts();
        if (!clip.ok) {
            console.error('Clipboard access failed.');
            process.exit(2);
        }
        console.log(JSON.stringify({
            clipboardSource: clip.source,
            ...diagnoseClipboardText(clip.text),
        }, null, 2));
        process.exit(0);
    }

    try {
        const resolved = await resolveEndpointFromClipboardOrPrompt({ forceInteractive });
        writeUri(resolved.endpoint);
        console.log('ZILLIZ_URI updated in backend/.env');
        console.log('host_hint:', hostHint(resolved.endpoint));
        console.log('source:', resolved.via);
        if (resolved.extracted) {
            console.log('note: endpoint was extracted from richer clipboard/paste content');
        }
        console.log('Other variables were preserved.');
        console.log('Auth will use ZILLIZ_API_USER / ZILLIZ_API_PASSWORD (token left empty).');
    } catch (error) {
        console.error(error.message || 'Failed to set ZILLIZ_URI');
        console.error('Tip: in Zilliz Cloud open your cluster → Connect → copy Public Endpoint only.');
        console.error('Then either re-run this script, or paste interactively:');
        console.error('  node scripts/set-zilliz-uri-from-clipboard.js --interactive');
        process.exit(2);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    readClipboardAttempts,
    resolveEndpointFromClipboardOrPrompt,
    writeUri,
};
