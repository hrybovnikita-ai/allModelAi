#!/usr/bin/env node
/**
 * Live model audit (server-side keys only). Respects MIN_TEST_INTERVAL_MS between calls.
 * Usage:
 *   node scripts/run-model-diagnostics-batch.cjs [--priority] [--email audit@local]
 */
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const {
    buildModelDiagnosticsCatalog,
    runModelDiagnosticTest,
} = require('../src/services/modelDiagnosticsService');

const PRIORITY_KEYS = new Set([
    'anonin:pool',
    'gemini:3.5-flash-lite',
    'gemini:3.1-flash-lite',
    'gemini:3-flash',
    'groq:8b',
    'cloudflare:8b',
    'cloudflare:70b',
    'nemotron:ultra',
    'deepseek-r1:r1',
    'ollama:gemma4-31b',
]);

const FREE_TIER_KEYS = PRIORITY_KEYS;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
    const priorityOnly = process.argv.includes('--priority') || process.argv.includes('--free-tier');
    const emailArg = process.argv.find((a) => a.startsWith('--email='));
    const email = emailArg ? emailArg.split('=')[1] : 'model-audit@local';

    const catalog = buildModelDiagnosticsCatalog(email);
    let rows = catalog.models;
    if (priorityOnly) {
        rows = rows.filter((row) => FREE_TIER_KEYS.has(`${row.slug}:${row.variantId}`));
    }

    console.log(`AllModelAI model audit — ${rows.length} targets (${priorityOnly ? 'priority' : 'full'})`);
    const report = [];

    for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const label = `${row.slug}/${row.variantId} — ${row.displayName}`;
        process.stdout.write(`[${i + 1}/${rows.length}] ${label}… `);
        const outcome = await runModelDiagnosticTest({
            email,
            slug: row.slug,
            variantId: row.variantId,
            confirmBillable: true,
        });
        const last = outcome.lastTest || {};
        const status = outcome.model?.healthStatus || (outcome.ok ? 'Working' : 'Failed');
        const http = last.httpStatus ?? outcome.status ?? 0;
        const err = last.errorDescription || outcome.message || '';
        console.log(`${status} · HTTP ${http}${err ? ` · ${err.slice(0, 120)}` : ''}`);
        report.push({
            slug: row.slug,
            variantId: row.variantId,
            displayName: row.displayName,
            modelIdentifier: row.modelIdentifier,
            healthStatus: status,
            httpStatus: http,
            error: err,
            ok: Boolean(outcome.ok),
            latencyMs: last.responseTimeMs ?? null,
        });
        if (i < rows.length - 1) await sleep(3200);
    }

    const outPath = path.join(__dirname, '../data/modelDiagnosticsLastRun.json');
    require('node:fs').writeFileSync(outPath, JSON.stringify({ email, ranAt: new Date().toISOString(), report }, null, 2));
    console.log(`\nWrote ${outPath}`);
    const working = report.filter((r) => r.ok).length;
    console.log(`Summary: ${working}/${report.length} working`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
