const test = require('node:test');
const assert = require('node:assert/strict');
const { assertMagicHourRequestSupported } = require('../src/services/magicHourCapabilities');
const { MagicHourError } = require('../src/services/magicHourClient');

test('assertMagicHourRequestSupported accepts LTX-2.5 Developer Hub defaults', () => {
    const normalized = assertMagicHourRequestSupported({
        aspectRatio: '16:9',
        resolution: '480p',
        durationSeconds: 3,
    });
    assert.equal(normalized.model, 'ltx-2.5');
    assert.equal(normalized.resolution, '480p');
    assert.equal(normalized.durationSeconds, 3);
});

test('assertMagicHourRequestSupported rejects unsupported 4k resolution', () => {
    assert.throws(
        () => assertMagicHourRequestSupported({ resolution: '4k', durationSeconds: 5, aspectRatio: '16:9' }),
        (error) => error instanceof MagicHourError && error.code === 'MAGIC_HOUR_INVALID_REQUEST',
    );
});

test('assertMagicHourRequestSupported rejects 360p for LTX-2.5', () => {
    assert.throws(
        () => assertMagicHourRequestSupported({ resolution: '360p', durationSeconds: 3, aspectRatio: '16:9' }),
        (error) => error instanceof MagicHourError && error.code === 'MAGIC_HOUR_INVALID_REQUEST',
    );
});

test('assertMagicHourRequestSupported rejects duration above 60 seconds for LTX-2.5', () => {
    assert.throws(
        () => assertMagicHourRequestSupported({ resolution: '480p', durationSeconds: 61, aspectRatio: '16:9' }),
        (error) => error instanceof MagicHourError && error.code === 'MAGIC_HOUR_INVALID_REQUEST',
    );
});

test('listMagicHourModelsPublic exposes LTX-2.5 duration options including 3 seconds', () => {
    const { listMagicHourModelsPublic } = require('../src/services/magicHourCapabilities');
    const ltx = listMagicHourModelsPublic().find((item) => item.id === 'ltx-2.5');
    assert.ok(ltx);
    assert.ok(ltx.durationSecondsOptions.includes(3));
    assert.equal(ltx.defaultDurationSeconds, 3);
    assert.equal(ltx.defaultResolution, '480p');
});
