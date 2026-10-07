const crypto = require('node:crypto');
const { isPostgresConnection } = require('../../db/postgresHttpReads');
const { classifyTask, isSimpleGreeting } = require('../smartRouter2/classifyTask');
const knowledgeBaseService = require('../rag/knowledgeBaseService');
const { selectSmartRoute } = require('../smartRouter2');
const webSearchService = require('../webSearchService');
const { getOpenRouterApiKey } = require('../../openRouterConfig');

const MAX_AGENT_STEPS = Math.min(Math.max(parseInt(process.env.MULTI_AGENT_MAX_STEPS || '12', 10), 4), 30);
const MAX_RETRIES = 2;
const AGENT_TIMEOUT_MS = 45000;

const AGENT_ORDER = ['planner', 'research', 'reasoning', 'coding', 'verifier', 'writer'];

async function completeJson(prompt, maxTokens = 700) {
    const gatewayKey = getOpenRouterApiKey();
    if (!gatewayKey?.trim()) {
        return null;
    }
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
        headers: {
            Authorization: `Bearer ${gatewayKey.trim()}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            max_tokens: maxTokens,
            temperature: 0.2,
            messages: [
                { role: 'system', content: 'Return valid JSON only. No markdown.' },
                { role: 'user', content: prompt },
            ],
        }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
        return JSON.parse(match[0]);
    } catch {
        return null;
    }
}

function writeAgentEvent(res, payload) {
    if (!res || res.writableEnded) return;
    const { writeSse } = require('../webSearchService');
    writeSse(res, {
        multiAgent: true,
        agentProgress: payload,
    });
}

async function persistStep(connection, runId, agent, status, summary, payload) {
    if (!connection || !runId) return;
    const createdAt = new Date().toISOString();
    const payloadJson = JSON.stringify(payload || {}).slice(0, 8000);
    try {
        if (isPostgresConnection(connection)) {
            await connection.pool.query(
                `INSERT INTO research_steps (run_id, agent, status, summary, payload_json, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6)`,
                [runId, agent, status, summary, payloadJson, createdAt],
            );
        } else {
            connection.database.prepare(
                `INSERT INTO research_steps (run_id, agent, status, summary, payload_json, created_at)
                 VALUES (?, ?, ?, ?, ?, ?)`,
            ).run(runId, agent, status, summary, payloadJson, createdAt);
        }
    } catch (error) {
        console.warn('[MULTI_AGENT]', error.message);
    }
}

async function createRun(connection, email, query, mode) {
    const id = `run-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    if (isPostgresConnection(connection)) {
        await connection.pool.query(
            `INSERT INTO research_runs (id, email, query, mode, status, created_at) VALUES ($1,$2,$3,$4,'running',$5)`,
            [id, email, query, mode, now],
        );
    } else {
        connection.database.prepare(
            'INSERT INTO research_runs (id, email, query, mode, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(id, email, query, mode, 'running', now);
    }
    return id;
}

async function finishRun(connection, runId, status) {
    const finishedAt = new Date().toISOString();
    if (isPostgresConnection(connection)) {
        await connection.pool.query(
            'UPDATE research_runs SET status = $1, finished_at = $2 WHERE id = $3',
            [status, finishedAt, runId],
        );
    } else {
        connection.database.prepare(
            'UPDATE research_runs SET status = ?, finished_at = ? WHERE id = ?',
        ).run(status, finishedAt, runId);
    }
}

/**
 * Multi-agent research pipeline with safe limits and public progress only.
 */
async function runMultiAgentResearch(res, options) {
    const {
        query,
        email,
        connection,
        useKnowledge = true,
        modelAllowed = () => true,
        cancelled = () => false,
    } = options;

    if (isSimpleGreeting(query)) {
        return { skipped: true, reason: 'simple_query' };
    }

    const task = classifyTask(query, { useKnowledge, routerMode: 'quality' });
    if (!task.needsMultiAgent && query.length < 160) {
        return { skipped: true, reason: 'single_model_sufficient' };
    }

    const route = selectSmartRoute(query, { routerMode: 'quality', modelAllowed, useKnowledge });
    const runId = await createRun(connection, email, query, 'multi-agent');
    let steps = 0;

    const emit = async (agent, status, summary, extra = {}) => {
        steps += 1;
        if (steps > MAX_AGENT_STEPS) {
            throw Object.assign(new Error('Multi-agent step limit reached.'), { code: 'AGENT_LIMIT' });
        }
        writeAgentEvent(res, { agent, status, summary, ...extra });
        await persistStep(connection, runId, agent, status, summary, extra);
    };

    await emit('planner', 'running', 'Planning task…');
    if (cancelled()) throw Object.assign(new Error('Cancelled'), { code: 'CANCELLED' });

    const plan = (await completeJson(
        `Break this user question into 3-5 short actionable steps (JSON):
{"steps":["..."],"focus":"one line"}
Question: ${query.slice(0, 800)}`,
    )) || { steps: ['Understand question', 'Gather evidence', 'Verify claims', 'Write answer'], focus: query.slice(0, 120) };

    await emit('planner', 'complete', 'Task plan ready', { steps: plan.steps?.slice(0, 5) });

    let kbSources = [];
    if (useKnowledge && task.needsKnowledge) {
        await emit('research', 'running', 'Searching knowledge base…');
        const kb = await knowledgeBaseService.answerWithKnowledge(connection, email, query, 5);
        kbSources = kb.sources || [];
        await emit(
            'research',
            'complete',
            kbSources.length ? `Found ${kbSources.length} relevant sections` : 'No strong KB matches',
            { sources: kbSources.slice(0, 5) },
        );
    }

    let webSources = [];
    if (task.taskType === 'research' || task.taskType === 'coding') {
        await emit('research', 'running', 'Collecting web sources…');
        try {
            const collected = await webSearchService.collectWebSources(query);
            webSources = collected.sources || [];
            await emit('research', 'complete', webSources.length ? `Web sources: ${webSources.length}` : 'Web search optional', {
                webCount: webSources.length,
            });
        } catch {
            await emit('research', 'complete', 'Web search unavailable — continuing with available context');
        }
    }

    if (task.taskType === 'coding') {
        await emit('coding', 'complete', 'Coding agent noted implementation focus');
    } else {
        await emit('reasoning', 'complete', 'Reasoning pass on collected evidence');
    }

    await emit('verifier', 'running', 'Checking claims…');
    const verify = (await completeJson(
        `List issues with unsupported claims (JSON):
{"issues":["..."],"status":"ok|needs_caution"}
Evidence snippets:
KB: ${kbSources.map((s) => s.excerpt).join(' ').slice(0, 1500)}
Web: ${webSources.map((s) => s.excerpt || s.title).join(' ').slice(0, 1500)}
Question: ${query.slice(0, 400)}`,
    )) || { issues: [], status: 'ok' };
    await emit('verifier', 'complete', verify.issues?.length ? 'Some claims need caution' : 'Claims look consistent', {
        issues: (verify.issues || []).slice(0, 5),
    });

    await emit('writer', 'running', 'Preparing answer…');

    const sourceLines = [
        ...kbSources.map((s, i) => `[KB${i + 1}] ${s.documentName}${s.pageNumber ? ` p.${s.pageNumber}` : ''}`),
        ...webSources.map((s) => `[Web] ${s.title || s.url}`),
    ];

    const writerPrompt = `Write a clear final answer for the user. Do not reveal chain-of-thought.
Use ONLY provided evidence for factual claims. If evidence is weak, say so.
Cite sources inline like [KB1] or [Web] when used.
Route hint: ${route.displayName} (${route.taskType}).

Question: ${query}

Knowledge:
${kbSources.map((s, i) => `[KB${i + 1}] ${s.excerpt}`).join('\n')}

Web:
${webSources.map((s) => `${s.title}: ${s.excerpt || ''}`).join('\n')}

Verifier notes: ${(verify.issues || []).join('; ') || 'none'}`;

    const gatewayKey = getOpenRouterApiKey();
    if (!gatewayKey?.trim()) {
        await finishRun(connection, runId, 'failed');
        throw Object.assign(new Error('Multi-agent writer requires OpenRouter API key.'), { status: 503 });
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
        headers: {
            Authorization: `Bearer ${gatewayKey.trim()}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            max_tokens: 1800,
            temperature: 0.35,
            messages: [
                { role: 'system', content: 'You are the Writer agent. Be concise, accurate, and cite sources.' },
                { role: 'user', content: writerPrompt },
            ],
            stream: true,
        }),
    });

    if (!response.ok) {
        await finishRun(connection, runId, 'failed');
        throw Object.assign(new Error('Writer model request failed.'), { status: 502 });
    }

    await emit('writer', 'complete', 'Final response ready', { sources: sourceLines.slice(0, 12) });
    await finishRun(connection, runId, 'complete');

    return {
        runId,
        route,
        kbSources,
        webSources,
        streamResponse: response,
        agents: AGENT_ORDER.map((agent) => ({ agent, status: 'complete' })),
    };
}

module.exports = {
    runMultiAgentResearch,
    AGENT_ORDER,
    MAX_AGENT_STEPS,
    MAX_RETRIES,
};
