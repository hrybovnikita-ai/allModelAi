'use strict';

/**
 * Build clearly synthetic API-key-shaped strings at runtime.
 * Parts are concatenated so tracked source never contains a complete
 * sk-/sk-proj-/AIza/xai- literal that trips CI secret scanning.
 */

function padBody(seed, minLen = 36) {
    const base = String(seed || 'testonly');
    if (base.length >= minLen) return base.slice(0, Math.max(minLen, base.length));
    return base + '0'.repeat(minLen - base.length);
}

/** @returns {string} e.g. sk-testonly000… (synthetic; not a real credential) */
function syntheticOpenAiSk(seed = 'testonly') {
    return ['sk', padBody(seed)].join('-');
}

/** @returns {string} e.g. sk-proj-testonly000… (synthetic; not a real credential) */
function syntheticOpenAiSkProj(seed = 'testonly') {
    return ['sk', 'proj', padBody(seed)].join('-');
}

module.exports = {
    padBody,
    syntheticOpenAiSk,
    syntheticOpenAiSkProj,
};
