/**
 * Validate / normalize Zilliz Cloud Public Endpoints without logging secrets.
 * Supports classic *.zillizcloud.com and serverless *.cloud.zilliz.com hosts.
 */

const ALLOWED_HOST_SUFFIXES = [
    '.zillizcloud.com',
    '.cloud.zilliz.com',
    '.zilliz.com',
    '.milvus.io',
];

const ALLOWED_EXACT_HOSTS = new Set([
    'zillizcloud.com',
    'cloud.zilliz.com',
    'zilliz.com',
    'milvus.io',
]);

/** Match full URLs or bare hosts used by Zilliz Cloud / serverless. */
const ENDPOINT_CANDIDATE_RE = new RegExp(
    String.raw`(https?:\/\/)?(`
    + String.raw`[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*`
    + String.raw`\.(?:zillizcloud\.com|cloud\.zilliz\.com|zilliz\.com|milvus\.io)`
    + String.raw`)(?::(\d{2,5}))?`,
    'gi',
);

/** Region root only — not a usable Public Endpoint by itself. */
const REGION_ROOT_HOST_RE = /^(aws|gcp|ali|azure)-[a-z0-9-]+\.cloud\.zilliz\.com$/i;

function isAllowedZillizHost(hostname) {
    const host = String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
    if (!host) return false;
    if (ALLOWED_EXACT_HOSTS.has(host)) return true;
    if (REGION_ROOT_HOST_RE.test(host)) return false;
    return ALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

function scoreEndpointCandidate(rawCandidate) {
    const normalized = normalizeZillizEndpoint(rawCandidate, {
        sourceLabel: 'Candidate',
        allowExtract: false,
    });
    if (!normalized.ok) return { score: -1, value: '' };
    const labels = normalized.hostname.split('.').length;
    let score = normalized.hostname.length + labels * 10;
    if (/^https:/i.test(normalized.value)) score += 5;
    if (normalized.port) score += 2;
    if (/\.serverless\./i.test(normalized.hostname)) score += 20;
    if (/\.api\./i.test(normalized.hostname)) score += 15;
    return { score, value: normalized.value };
}

/**
 * Collect raw host/URL candidates from messy clipboard HTML/text.
 * Never returns surrounding prompt text.
 */
function listEndpointCandidates(raw) {
    const text = String(raw || '')
        .replace(/^\uFEFF/, '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '');

    if (!text.trim()) return [];

    const candidates = [];

    const hrefRe = /href\s*=\s*["'](https?:\/\/[^"']+(?:zillizcloud\.com|cloud\.zilliz\.com|zilliz\.com|milvus\.io)[^"']*)["']/gi;
    let hrefMatch = hrefRe.exec(text);
    while (hrefMatch) {
        candidates.push(hrefMatch[1].trim());
        hrefMatch = hrefRe.exec(text);
    }

    ENDPOINT_CANDIDATE_RE.lastIndex = 0;
    let match = ENDPOINT_CANDIDATE_RE.exec(text);
    while (match) {
        const scheme = match[1] || '';
        const host = match[2];
        const port = match[3] ? `:${match[3]}` : '';
        candidates.push(`${scheme}${host}${port}`.trim());
        match = ENDPOINT_CANDIDATE_RE.exec(text);
    }

    return [...new Set(candidates)];
}

function extractEndpointCandidate(raw) {
    let best = { score: -1, value: '' };
    for (const candidate of listEndpointCandidates(raw)) {
        const ranked = scoreEndpointCandidate(candidate);
        if (ranked.score > best.score) best = ranked;
    }
    return best.value;
}

/** Safe clipboard diagnosis — never includes hosts, tokens, or full text. */
function diagnoseClipboardText(raw) {
    const text = String(raw || '');
    const candidates = listEndpointCandidates(text);
    let usable = 0;
    let regionRoots = 0;
    for (const candidate of candidates) {
        const host = String(candidate)
            .replace(/^https?:\/\//i, '')
            .split(':')[0]
            .toLowerCase();
        if (REGION_ROOT_HOST_RE.test(host)) regionRoots += 1;
        else if (scoreEndpointCandidate(candidate).score >= 0) usable += 1;
    }
    return {
        length: text.trim().length,
        hasNewlines: /[\r\n]/.test(text),
        hasHttps: /https?:\/\//i.test(text),
        hasServerlessWord: /serverless/i.test(text),
        hasPublicEndpointLabel: /public\s*endpoint/i.test(text),
        candidateCount: candidates.length,
        usableCandidateCount: usable,
        regionRootCount: regionRoots,
        likelyMissingClusterId: usable === 0 && regionRoots > 0,
    };
}

/**
 * @param {string} raw
 * @param {{ sourceLabel?: string, allowExtract?: boolean }} [options]
 */
function normalizeZillizEndpoint(raw, { sourceLabel = 'Value', allowExtract = true } = {}) {
    let value = String(raw || '')
        .replace(/^\uFEFF/, '')
        .trim()
        .replace(/^["'`]+|["'`]+$/g, '');

    value = value.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();

    if (!value) {
        return { ok: false, reason: `${sourceLabel} is empty.` };
    }

    // Multi-line / HTML clipboard: try to extract a single endpoint host/URL
    if (allowExtract && (/[\r\n]/.test(value) || value.length > 220 || /<[^>]+>/.test(value))) {
        const extracted = extractEndpointCandidate(value);
        if (!extracted) {
            const diagnosis = diagnoseClipboardText(value);
            if (diagnosis.likelyMissingClusterId) {
                return {
                    ok: false,
                    reason: `${sourceLabel} only contains a Zilliz region host (for example aws-…cloud.zilliz.com), `
                        + 'not the full Public Endpoint with the cluster id. '
                        + 'In Zilliz Cloud open the cluster → Connect → copy Public Endpoint '
                        + '(it usually looks like <cluster-id>.serverless.<region>.cloud.zilliz.com).',
                };
            }
            return {
                ok: false,
                reason: `${sourceLabel} contains multiple lines and no recognizable Zilliz endpoint.`,
            };
        }
        value = extracted;
    } else if (/[\r\n]/.test(value)) {
        return {
            ok: false,
            reason: `${sourceLabel} contains multiple lines (not a single Public Endpoint).`,
        };
    }

    if (value.length > 300) {
        return { ok: false, reason: `${sourceLabel} is too long to be a Zilliz Public Endpoint.` };
    }

    value = value.replace(/\/+$/, '');

    if (!/^https?:\/\//i.test(value)) {
        value = `https://${value}`;
    }

    let url;
    try {
        url = new URL(value);
    } catch {
        return { ok: false, reason: `${sourceLabel} is not a valid URL.` };
    }

    if (!/^https?:$/i.test(url.protocol)) {
        return { ok: false, reason: `${sourceLabel} must use http or https.` };
    }
    if (!url.hostname) {
        return { ok: false, reason: `${sourceLabel} hostname is missing.` };
    }
    if (!isAllowedZillizHost(url.hostname)) {
        return {
            ok: false,
            reason: `${sourceLabel} host is not a recognized Zilliz/Milvus endpoint domain `
                + '(expected *.zillizcloud.com, *.cloud.zilliz.com, or *.milvus.io).',
        };
    }
    if (url.username || url.password) {
        return {
            ok: false,
            reason: `${sourceLabel} must not include username/password. Use ZILLIZ_API_* instead.`,
        };
    }

    const portPart = url.port ? `:${url.port}` : '';
    const normalized = `${url.protocol}//${url.hostname}${portPart}`;

    return {
        ok: true,
        value: normalized,
        hostname: url.hostname,
        port: url.port || '',
        extracted: allowExtract && String(raw || '').trim() !== normalized,
    };
}

function hostHint(endpoint) {
    try {
        const host = new URL(endpoint).hostname;
        if (host.length <= 14) return `${host.slice(0, 3)}…`;
        return `${host.slice(0, 6)}…${host.slice(-8)}`;
    } catch {
        return '(set)';
    }
}

function upsertZillizUri(contents, endpoint) {
    const lines = String(contents || '').split(/\r?\n/);
    let found = false;
    const next = lines.map((line) => {
        if (line.startsWith('ZILLIZ_URI=')) {
            found = true;
            return `ZILLIZ_URI=${endpoint}`;
        }
        return line;
    });
    if (!found) next.push(`ZILLIZ_URI=${endpoint}`);
    return `${next.join('\n').replace(/\n*$/, '')}\n`;
}

module.exports = {
    ALLOWED_HOST_SUFFIXES,
    isAllowedZillizHost,
    listEndpointCandidates,
    extractEndpointCandidate,
    diagnoseClipboardText,
    normalizeZillizEndpoint,
    hostHint,
    upsertZillizUri,
};
