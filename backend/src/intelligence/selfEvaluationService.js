const crypto = require('node:crypto');
const { isPostgresConnection } = require('../db/postgresHttpReads');
const { queryPgPool, resolvePostgresAsyncPool } = require('../db/pgPoolQuery');
const { DATASET_VERSION, DETERMINISTIC_SUITES, evaluateDeterministicCase } = require('./benchmarkFixtures');

async function pgQuery(connection, text, values = []) {
    return queryPgPool(resolvePostgresAsyncPool(connection), text, values);
}

function listBenchmarkSuites() {
    return Object.entries(DETERMINISTIC_SUITES).map(([id, suite]) => ({
        id,
        label: suite.label,
        caseCount: suite.cases.length,
        datasetVersion: DATASET_VERSION,
        billable: false,
    }));
}

async function runDeterministicBenchmark(connection, email, { suiteId }) {
    const suite = DETERMINISTIC_SUITES[suiteId];
    if (!suite) {
        throw Object.assign(new Error('Unknown benchmark suite.'), { status: 400 });
    }

    const runId = `eval-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const normalized = String(email).trim().toLowerCase();

    if (isPostgresConnection(connection)) {
        await pgQuery(
            connection,
            `INSERT INTO eval_benchmark_runs (id, email, suite, dataset_version, status, summary, created_at)
             VALUES ($1,$2,$3,$4,'running','{}',$5)`,
            [runId, normalized, suiteId, DATASET_VERSION, now],
        );
    } else {
        connection.database.prepare(
            `INSERT INTO eval_benchmark_runs (id, email, suite, dataset_version, status, summary, created_at)
             VALUES (?, ?, ?, ?, 'running', '{}', ?)`,
        ).run(runId, normalized, suiteId, DATASET_VERSION, now);
    }

    const results = [];
    let passed = 0;
    for (const testCase of suite.cases) {
        const outcome = evaluateDeterministicCase(testCase, undefined);
        const resultId = `evalr-${crypto.randomUUID()}`;
        if (outcome.outcome === 'pass') passed += 1;
        const details = { ...outcome.details, caseType: testCase.type, prompt: testCase.prompt || testCase.id };
        if (isPostgresConnection(connection)) {
            await pgQuery(
                connection,
                `INSERT INTO eval_benchmark_results
                 (id, run_id, case_id, model_id, outcome, score, details, latency_ms, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
                [
                    resultId,
                    runId,
                    testCase.id,
                    'deterministic-fixture',
                    outcome.outcome,
                    outcome.score,
                    JSON.stringify(details),
                    outcome.latencyMs,
                    now,
                ],
            );
        } else {
            connection.database.prepare(
                `INSERT INTO eval_benchmark_results
                 (id, run_id, case_id, model_id, outcome, score, details, latency_ms, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ).run(
                resultId,
                runId,
                testCase.id,
                'deterministic-fixture',
                outcome.outcome,
                outcome.score,
                JSON.stringify(details),
                outcome.latencyMs,
                now,
            );
        }
        results.push({ resultId, caseId: testCase.id, ...outcome });
    }

    const summary = {
        passRate: suite.cases.length ? passed / suite.cases.length : null,
        passed,
        total: suite.cases.length,
        measuredOnly: true,
        note: 'Deterministic fixtures only — no LLM calls.',
    };
    const finished = new Date().toISOString();

    if (isPostgresConnection(connection)) {
        await pgQuery(
            connection,
            `UPDATE eval_benchmark_runs SET status = 'completed', summary = $1, finished_at = $2 WHERE id = $3`,
            [JSON.stringify(summary), finished, runId],
        );
    } else {
        connection.database.prepare(
            `UPDATE eval_benchmark_runs SET status = 'completed', summary = ?, finished_at = ? WHERE id = ?`,
        ).run(JSON.stringify(summary), finished, runId);
    }

    return { runId, suiteId, datasetVersion: DATASET_VERSION, summary, results };
}

async function listEvalRuns(connection, email, { limit = 20 } = {}) {
    const normalized = String(email).trim().toLowerCase();
    const cap = Math.min(Math.max(Number(limit) || 20, 1), 50);
    if (isPostgresConnection(connection)) {
        const result = await pgQuery(
            connection,
            `SELECT id, suite, dataset_version AS "datasetVersion", status, summary, created_at AS "createdAt", finished_at AS "finishedAt"
             FROM eval_benchmark_runs WHERE email = $1 ORDER BY created_at DESC LIMIT $2`,
            [normalized, cap],
        );
        return result.rows;
    }
    return connection.database.prepare(
        `SELECT id, suite, dataset_version AS datasetVersion, status, summary, created_at AS createdAt, finished_at AS finishedAt
         FROM eval_benchmark_runs WHERE email = ? ORDER BY created_at DESC LIMIT ?`,
    ).all(normalized, cap);
}

async function submitHumanReview(connection, reviewerEmail, { resultId, decision, notes }) {
    const id = `hr-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const dec = String(decision || '').trim().toLowerCase();
    if (!['approve', 'reject', 'flag'].includes(dec)) {
        throw Object.assign(new Error('decision must be approve, reject, or flag.'), { status: 400 });
    }
    if (isPostgresConnection(connection)) {
        await pgQuery(
            connection,
            `INSERT INTO eval_human_reviews (id, result_id, reviewer_email, decision, notes, created_at)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [id, resultId, String(reviewerEmail).toLowerCase(), dec, notes ? String(notes).slice(0, 2000) : null, now],
        );
    } else {
        connection.database.prepare(
            `INSERT INTO eval_human_reviews (id, result_id, reviewer_email, decision, notes, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(id, resultId, String(reviewerEmail).toLowerCase(), dec, notes ? String(notes).slice(0, 2000) : null, now);
    }
    return { id, resultId, decision: dec };
}

module.exports = {
    listBenchmarkSuites,
    runDeterministicBenchmark,
    listEvalRuns,
    submitHumanReview,
};
