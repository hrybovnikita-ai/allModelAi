'use strict';

const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const CACHE_PATH = join(__dirname, '../data/modelDiagnosticsCache.json');

/** Slugs that should not be promoted via OpenRouter paid credits in free-first routing. */
const FREE_FIRST_SLUGS = new Set([
    'nemotron',
    'deepseek-r1',
    'cloudflare',
    'gpt-oss',
    'gemini',
    'groq',
    'gpt-oss-groq',
    'ollama',
]);

function normalizeSlug(raw) {
    return String(raw || '').trim().toLowerCase();
}

function loadVerifiedEntries() {
    try {
        if (!existsSync(CACHE_PATH)) return [];
        const raw = JSON.parse(readFileSync(CACHE_PATH, 'utf8'));
        const entries = raw?.entries && typeof raw.entries === 'object' ? raw.entries : {};
        const verified = [];
        for (const [key, row] of Object.entries(entries)) {
            if (!row?.ok) continue;
            const parts = String(key).split(':');
            if (parts.length < 3) continue;
            const slug = normalizeSlug(parts[1]);
            const variantId = parts[2];
            verified.push({
                slug,
                variantId,
                testedAt: row.testedAt,
                routeMode: row.routeMode,
                modelId: row.verifiedModelId || null,
            });
        }
        return verified;
    } catch {
        return [];
    }
}

let verifiedCache = { loadedAt: 0, rows: [] };
const REFRESH_MS = 15_000;

function getVerifiedRows() {
    const now = Date.now();
    if (now - verifiedCache.loadedAt > REFRESH_MS) {
        verifiedCache = { loadedAt: now, rows: loadVerifiedEntries() };
    }
    return verifiedCache.rows;
}

function isSlugVerifiedWorking(slug) {
    const key = normalizeSlug(slug);
    return getVerifiedRows().some((row) => row.slug === key);
}

function verifiedBoostForSlug(slug) {
    return isSlugVerifiedWorking(slug) ? 4 : 0;
}

function isFreeFirstSlug(slug) {
    return FREE_FIRST_SLUGS.has(normalizeSlug(slug));
}

function recordVerifiedInference({ slug, variantId, routeMode, modelId }) {
    const rows = getVerifiedRows();
    const key = normalizeSlug(slug);
    const existing = rows.findIndex((r) => r.slug === key && r.variantId === variantId);
    const row = {
        slug: key,
        variantId,
        testedAt: new Date().toISOString(),
        routeMode,
        modelId: modelId || null,
    };
    if (existing >= 0) rows[existing] = row;
    else rows.push(row);
    verifiedCache = { loadedAt: Date.now(), rows };
}

module.exports = {
    FREE_FIRST_SLUGS,
    getVerifiedRows,
    isFreeFirstSlug,
    isSlugVerifiedWorking,
    verifiedBoostForSlug,
    recordVerifiedInference,
};
