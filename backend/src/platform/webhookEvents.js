'use strict';

const crypto = require('crypto');

const processed = new Map();
const MAX_EVENTS = 500;
const MAX_SKEW_MS = 5 * 60 * 1000;

function verifyHmacSha256({ secret, payload, signature }) {
    const key = String(secret || '');
    const provided = String(signature || '').trim();
    if (!key || !provided) return false;
    const digest = crypto.createHmac('sha256', key).update(payload).digest('hex');
    const a = Buffer.from(digest);
    const b = Buffer.from(provided.replace(/^sha256=/i, ''));
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

function assertFreshTimestamp(timestamp) {
    const value = Number(timestamp);
    if (!Number.isFinite(value)) return false;
    const ms = value > 10_000_000_000 ? value : value * 1000;
    return Math.abs(Date.now() - ms) <= MAX_SKEW_MS;
}

function rememberEvent(eventId) {
    const id = String(eventId || '').trim();
    if (!id || id.length > 200) {
        const error = new Error('Webhook event id is required.');
        error.status = 400;
        throw error;
    }
    if (processed.has(id)) return { duplicate: true, status: processed.get(id).status };
    if (processed.size >= MAX_EVENTS) {
        const oldest = processed.keys().next().value;
        processed.delete(oldest);
    }
    processed.set(id, { status: 'accepted', at: new Date().toISOString() });
    return { duplicate: false, status: 'accepted' };
}

function listEvents() {
    return [...processed.entries()].slice(-50).map(([id, row]) => ({ id, status: row.status, at: row.at }));
}

function clearEventsForTests() {
    processed.clear();
}

module.exports = {
    verifyHmacSha256,
    assertFreshTimestamp,
    rememberEvent,
    listEvents,
    clearEventsForTests,
};
