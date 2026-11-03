'use strict';

/**
 * Human-readable model health statuses for the developer Model Health dashboard.
 * "Working" is only returned after a successful real inference test (lastTest.ok).
 */

function classifyModelHealthStatus({ availabilityStatus, lastTest, routeMode }) {
    if (lastTest?.ok) return 'Working';
    if (!lastTest) {
        if (routeMode === 'blocked' || availabilityStatus === 'UNCONFIGURED') {
            return 'Not Configured';
        }
        return 'Untested';
    }
    const code = Number(lastTest.httpStatus) || 0;
    const msg = String(lastTest.errorDescription || '').toLowerCase();
    if (code === 429 || availabilityStatus === 'RATE_LIMITED') {
        if (/quota|billing|plan|credit/i.test(msg)) return 'Failed';
        return 'Rate Limited';
    }
    if (code === 401 || code === 403 || availabilityStatus === 'ACCESS_DENIED') {
        return 'Not Configured';
    }
    if (routeMode === 'blocked' || availabilityStatus === 'UNCONFIGURED') {
        return 'Not Configured';
    }
    return 'Failed';
}

function summarizeModelHealthRows(rows) {
    const summary = {
        total: rows.length,
        working: 0,
        failing: 0,
        notTested: 0,
        byStatus: {},
    };
    for (const row of rows) {
        const status = row.healthStatus || 'Untested';
        summary.byStatus[status] = (summary.byStatus[status] || 0) + 1;
        if (status === 'Working') summary.working += 1;
        else if (status === 'Untested') summary.notTested += 1;
        else summary.failing += 1;
    }
    return summary;
}

module.exports = {
    classifyModelHealthStatus,
    summarizeModelHealthRows,
};
