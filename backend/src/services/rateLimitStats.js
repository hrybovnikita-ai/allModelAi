const MAX_EVENTS = 500;

/** @type {Array<{ at: number, kind: string, scope: string, path: string }>} */
const events = [];

function recordRateLimitHit({ kind = 'ip', scope = '', path = '' } = {}) {
    events.push({
        at: Date.now(),
        kind: String(kind),
        scope: String(scope).slice(0, 80),
        path: String(path || '').split('?')[0].slice(0, 120),
    });
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
}

function summarizeRateLimits(windowMs = 15 * 60 * 1000) {
    const since = Date.now() - windowMs;
    const windowEvents = events.filter((e) => e.at >= since);
    const byKind = { ip: 0, user: 0 };
    const byPath = new Map();
    windowEvents.forEach((e) => {
        byKind[e.kind] = (byKind[e.kind] || 0) + 1;
        const row = byPath.get(e.path) || { path: e.path, count: 0 };
        row.count += 1;
        byPath.set(e.path, row);
    });
    return {
        windowMinutes: Math.round(windowMs / 60000),
        total429: windowEvents.length,
        byKind,
        topLimitedPaths: [...byPath.values()].sort((a, b) => b.count - a.count).slice(0, 8),
    };
}

function resetForTests() {
    events.length = 0;
}

module.exports = {
    recordRateLimitHit,
    summarizeRateLimits,
    resetForTests,
};
