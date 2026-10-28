'use strict';

/**
 * Human-readable model health statuses for the developer Model Health dashboard.
 * "Working" is only returned after a successful real inference test (lastTest.ok).
 */

function classifyModelHealthStatus({ availabilityStatus, lastTest, routeMode }) {
    if (lastTest?.ok) return 'Working';
    if (!lastTest) {
        if (routeMode === 'blocked' || availabilityStatus === 'UNCONFIGURED') {
            return 'Missing API Key';
        }
        return 'Not Tested';
    }
    const code = Number(lastTest.httpStatus) || 0;
    const msg = String(lastTest.errorDescription || '').toLowerCase();
    if (availabilityStatus === 'INVALID_MODEL' || code === 404 || /invalid model|model.*not found|not a valid model/i.test(msg)) {
        return 'Invalid Model ID';
    }
    if (code === 401 || code === 403 || availabilityStatus === 'ACCESS_DENIED') {
        return 'Missing API Key';
    }
    if (code === 429 || availabilityStatus === 'RATE_LIMITED') {
        if (/quota|billing|plan/i.test(msg)) return 'Quota Exceeded';
        return 'Rate Limited';
    }
    if (availabilityStatus === 'QUOTA_EXCEEDED' || /insufficient credit|quota exceeded|billing/i.test(msg)) {
        return 'Quota Exceeded';
    }
    if (code === 503 || /high demand|temporarily unavailable/i.test(msg)) {
        return 'Temporarily Unavailable';
    }
    if (code >= 500 || code === 408 || availabilityStatus === 'TEMPORARILY_UNAVAILABLE') {
        return 'Temporarily Unavailable';
    }
    return 'Provider Unavailable';
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
        const status = row.healthStatus || 'Not Tested';
        summary.byStatus[status] = (summary.byStatus[status] || 0) + 1;
        if (status === 'Working') summary.working += 1;
        else if (status === 'Not Tested') summary.notTested += 1;
        else summary.failing += 1;
    }
    return summary;
}

module.exports = {
    classifyModelHealthStatus,
    summarizeModelHealthRows,
};
