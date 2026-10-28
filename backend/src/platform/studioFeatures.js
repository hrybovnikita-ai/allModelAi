'use strict';

const crypto = require('crypto');

const users = new Map();
const SECRET = /(sk-[a-z0-9_-]{8,}|bearer\s+[a-z0-9._-]+|api[_-]?key\s*[:=]\s*\S+)/gi;

function bucket(email) {
    const key = String(email || '').toLowerCase();
    if (!users.has(key)) {
        users.set(key, { bugs: [], tasks: [], datasets: [], prototypes: [], motion: null });
    }
    return users.get(key);
}

function sanitizeLog(text) {
    return String(text || '').replace(SECRET, '[redacted]').slice(0, 8000);
}

function createBug(email, input = {}) {
    const title = String(input.title || '').trim();
    if (title.length < 3) {
        const error = new Error('Bug title is required.');
        error.status = 400;
        throw error;
    }
    const bug = {
        id: crypto.randomUUID(),
        title,
        description: String(input.description || '').slice(0, 4000),
        severity: ['low', 'medium', 'high'].includes(input.severity) ? input.severity : 'medium',
        category: String(input.category || 'general').slice(0, 40),
        status: 'new',
        log: sanitizeLog(input.log),
        history: [{ status: 'new', at: new Date().toISOString() }],
        suggestion: 'Review the sanitized log. No patch is applied automatically.',
    };
    bucket(email).bugs.unshift(bug);
    return bug;
}

const STATUSES = ['new', 'investigating', 'fix_proposed', 'testing', 'resolved'];

function updateBugStatus(email, id, status) {
    const bug = bucket(email).bugs.find((item) => item.id === id);
    if (!bug) {
        const error = new Error('Bug report was not found.');
        error.status = 404;
        throw error;
    }
    const next = STATUSES.indexOf(status);
    const current = STATUSES.indexOf(bug.status);
    if (next !== current + 1 && status !== bug.status) {
        const error = new Error('Bug status can only move one step forward.');
        error.status = 400;
        throw error;
    }
    bug.status = status;
    bug.history.push({ status, at: new Date().toISOString() });
    return bug;
}

function createSchedule(email, input = {}) {
    const name = String(input.name || '').trim();
    if (!name || !['daily', 'weekly', 'monthly'].includes(input.recurrence)) {
        const error = new Error('Name and daily, weekly, or monthly recurrence are required.');
        error.status = 400;
        throw error;
    }
    const task = {
        id: crypto.randomUUID(),
        name,
        recurrence: input.recurrence,
        timeZone: String(input.timeZone || 'UTC').slice(0, 64),
        model: String(input.model || 'smart').slice(0, 40),
        status: 'active',
        nextRunAt: input.nextRunAt || new Date(Date.now() + 60_000).toISOString(),
        history: [],
        running: false,
    };
    bucket(email).tasks.unshift(task);
    return task;
}

function claimDueTask(email, now = Date.now()) {
    const task = bucket(email).tasks.find((item) => item.status === 'active' && !item.running && Date.parse(item.nextRunAt) <= now);
    if (!task) return null;
    task.running = true;
    task.history.push({ at: new Date(now).toISOString(), result: 'claimed' });
    const day = 24 * 60 * 60 * 1000;
    const step = task.recurrence === 'monthly' ? 30 * day : task.recurrence === 'weekly' ? 7 * day : day;
    task.nextRunAt = new Date(now + step).toISOString();
    task.running = false;
    task.history[task.history.length - 1].result = 'recorded_without_provider_call';
    return task;
}

function parseCsv(text) {
    const lines = String(text || '').trim().split(/\r?\n/).slice(0, 500);
    if (!lines.length) return { columns: [], rows: [] };
    const columns = lines[0].split(',').map((cell) => cell.trim()).slice(0, 40);
    const rows = lines.slice(1, 201).map((line) => line.split(',').slice(0, columns.length));
    return { columns, rows };
}

function analyzeCsv(email, input = {}) {
    const name = String(input.name || 'dataset.csv').slice(0, 80);
    if (!name.endsWith('.csv') && !name.endsWith('.json')) {
        const error = new Error('Only CSV and JSON previews are accepted. XLSX needs a separate parser and is rejected.');
        error.status = 400;
        throw error;
    }
    const raw = String(input.text || '');
    if (raw.length > 200_000) {
        const error = new Error('Dataset is over the 200 KB preview limit.');
        error.status = 400;
        throw error;
    }
    let table;
    try {
        table = name.endsWith('.json')
            ? { columns: Object.keys(JSON.parse(raw)[0] || {}), rows: JSON.parse(raw).slice(0, 200).map((row) => Object.values(row)) }
            : parseCsv(raw);
    } catch {
        const error = new Error('Dataset could not be parsed.');
        error.status = 400;
        throw error;
    }
    const missing = table.columns.map((column, index) => table.rows.filter((row) => !String(row[index] || '').trim()).length);
    const report = {
        id: crypto.randomUUID(),
        name,
        columns: table.columns,
        rowCount: table.rows.length,
        missing,
        note: 'Statistics use the uploaded sample only. Uploaded code is not executed.',
    };
    bucket(email).datasets.unshift(report);
    return report;
}

function configReport() {
    const names = ['GEMINI_API_KEY', 'DATABASE_URL', 'FIREBASE_PROJECT_ID', 'CORS_ORIGIN', 'GITHUB_CLIENT_ID'];
    return names.map((name) => ({
        name,
        status: String(process.env[name] || '').trim() ? 'valid' : 'missing',
    }));
}

const TOOLS = {
    calculator: { confirm: false, run(args) { return Number(args.a) + Number(args.b); } },
    clock: { confirm: false, run() { return new Date().toISOString(); } },
    write_file: { confirm: true, run() { return 'blocked'; } },
};

function callTool(input = {}) {
    const tool = TOOLS[input.name];
    if (!tool) {
        const error = new Error('Unknown tool.');
        error.status = 400;
        throw error;
    }
    if (tool.confirm && input.confirmed !== true) {
        const error = new Error('This tool needs explicit confirmation.');
        error.status = 403;
        throw error;
    }
    if (typeof input.args?.a === 'string' && input.name === 'calculator') {
        const error = new Error('Calculator arguments must be numbers.');
        error.status = 400;
        throw error;
    }
    return { name: input.name, output: tool.run(input.args || {}) };
}

function validateStructured(output, schema = {}) {
    let data;
    try {
        data = typeof output === 'string' ? JSON.parse(output) : output;
    } catch {
        return { valid: false, errors: ['Output is not valid JSON.'] };
    }
    const errors = [];
    for (const field of schema.required || []) {
        if (data[field] == null) errors.push(`Missing ${field}`);
    }
    return { valid: errors.length === 0, errors, data: errors.length ? null : data };
}

function checkEvidence(claims = [], passages = []) {
    return claims.map((claim) => {
        const text = String(claim || '').trim();
        const hit = passages.find((passage) => text && String(passage.text || '').includes(text));
        return hit
            ? { claim: text, status: 'supported', sourceId: hit.id, excerpt: hit.text }
            : { claim: text, status: 'insufficient_evidence', sourceId: null, excerpt: null };
    });
}

function clearStudioForTests() {
    users.clear();
}

module.exports = {
    createBug,
    updateBugStatus,
    createSchedule,
    claimDueTask,
    analyzeCsv,
    configReport,
    callTool,
    validateStructured,
    checkEvidence,
    sanitizeLog,
    bucket,
    clearStudioForTests,
};
