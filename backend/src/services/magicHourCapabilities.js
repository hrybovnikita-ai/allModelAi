const { getMagicHourVideoModel } = require('./magicHourConfig');
const { MagicHourError } = require('./magicHourClient');

/** Supported Magic Hour text/image-to-video models (see docs.magichour.ai). */
const MODEL_SPECS = {
    'kling-3.0': {
        label: 'Kling 3.0',
        resolutions: ['360p', '480p', '720p', '1080p'],
        maxDurationSeconds: 10,
        minDurationSeconds: 1,
        aspectRatios: ['16:9', '9:16', '1:1'],
    },
    'ltx-2.5': {
        label: 'LTX 2.5',
        resolutions: ['480p', '720p', '1080p'],
        /** Magic Hour models doc + text-to-video API: integers 1–60 seconds. */
        minDurationSeconds: 1,
        maxDurationSeconds: 60,
        aspectRatios: ['16:9', '9:16', '1:1'],
        defaultResolution: '480p',
        defaultDurationSeconds: 3,
        /** Curated picker values (all supported by LTX-2.5). */
        durationSecondsOptions: [3, 4, 5, 6, 8, 10, 15, 20, 30],
    },
};

function normalizeModelId(model) {
    const value = String(model || getMagicHourVideoModel()).trim().toLowerCase();
    if (MODEL_SPECS[value]) return value;
    return getMagicHourVideoModel();
}

function assertMagicHourRequestSupported(params) {
    const model = normalizeModelId(params.model);
    const spec = MODEL_SPECS[model];
    if (!spec) {
        throw new MagicHourError(
            `Unsupported Magic Hour model "${model}". Set MAGIC_HOUR_VIDEO_MODEL to one of: ${Object.keys(MODEL_SPECS).join(', ')}.`,
            { status: 400, code: 'MAGIC_HOUR_INVALID_REQUEST', retryable: false },
        );
    }
    const resolution = String(params.resolution || spec.defaultResolution || '480p').toLowerCase();
    if (!spec.resolutions.includes(resolution)) {
        throw new MagicHourError(
            `Resolution ${resolution} is not supported for ${spec.label}. Choose: ${spec.resolutions.join(', ')}.`,
            { status: 400, code: 'MAGIC_HOUR_INVALID_REQUEST', retryable: false },
        );
    }
    const aspectRatio = String(params.aspectRatio || '16:9');
    if (!spec.aspectRatios.includes(aspectRatio)) {
        throw new MagicHourError(
            `Aspect ratio ${aspectRatio} is not supported for ${spec.label}. Choose: ${spec.aspectRatios.join(', ')}.`,
            { status: 400, code: 'MAGIC_HOUR_INVALID_REQUEST', retryable: false },
        );
    }
    const duration = Number(params.durationSeconds ?? spec.defaultDurationSeconds ?? 3);
    const rounded = Math.round(duration);
    if (!Number.isFinite(duration) || rounded < spec.minDurationSeconds || rounded > spec.maxDurationSeconds) {
        throw new MagicHourError(
            `Duration must be between ${spec.minDurationSeconds} and ${spec.maxDurationSeconds} seconds for ${spec.label}.`,
            { status: 400, code: 'MAGIC_HOUR_INVALID_REQUEST', retryable: false },
        );
    }
    return { model, resolution, aspectRatio, durationSeconds: rounded };
}

function listMagicHourModelsPublic() {
    return Object.entries(MODEL_SPECS).map(([id, spec]) => ({
        id,
        label: spec.label,
        resolutions: spec.resolutions,
        aspectRatios: spec.aspectRatios,
        minDurationSeconds: spec.minDurationSeconds,
        maxDurationSeconds: spec.maxDurationSeconds,
        durationSecondsOptions: spec.durationSecondsOptions || null,
        defaultResolution: spec.defaultResolution || spec.resolutions[0],
        defaultDurationSeconds: spec.defaultDurationSeconds ?? spec.minDurationSeconds,
    }));
}

function getModelSpec(modelId) {
    return MODEL_SPECS[normalizeModelId(modelId)] || null;
}

module.exports = {
    MODEL_SPECS,
    normalizeModelId,
    assertMagicHourRequestSupported,
    listMagicHourModelsPublic,
    getModelSpec,
};
