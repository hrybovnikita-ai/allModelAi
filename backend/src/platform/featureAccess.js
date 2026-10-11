const { ownerPlusActive, isOwner } = require('../billing/accessControl');
const { isMagicHourConfigured } = require('../services/magicHourConfig');
const { isGeminiVideoConfigured } = require('../services/geminiVideoService');
const {
    PLATFORM_FEATURES,
    JOB_TYPES,
    parseEnvBoolean,
    getFeatureById,
} = require('./featureRegistry');
const { probePgVector } = require('./vectorStoreProbe');
const { summarizeStoragePolicy } = require('./storagePolicy');

function sandboxConfigured() {
    const url = String(process.env.CODE_EXECUTOR_URL || '').trim();
    const enabled = parseEnvBoolean('FEATURE_CODE_EXECUTOR', false);
    return enabled && Boolean(url);
}

function voiceRealtimeConfigured() {
    return parseEnvBoolean('FEATURE_VOICE_REALTIME', false)
        && Boolean(
            String(process.env.OPENAI_API_KEY || '').trim()
            || String(process.env.AZURE_SPEECH_KEY || '').trim()
            || String(process.env.GOOGLE_CLOUD_SPEECH_API_KEY || '').trim(),
        );
}

function videoGenerationConfigured() {
    return isMagicHourConfigured() || isGeminiVideoConfigured();
}

function resolveFeatureState(feature, { access, infrastructure }) {
    const envOn = parseEnvBoolean(feature.envFlag, feature.defaultEnabled);
    if (!envOn) {
        return { enabled: false, status: 'disabled', reason: 'FEATURE_FLAG_OFF' };
    }
    if (feature.ownerPreviewOnly && !isOwner(access)) {
        return { enabled: false, status: 'planned', reason: 'OWNER_PREVIEW_ONLY' };
    }
    if (feature.requiresSandboxUrl && !infrastructure.codeExecutorReady) {
        return {
            enabled: false,
            status: 'planned',
            reason: 'SANDBOX_NOT_CONFIGURED',
            hint: 'Set FEATURE_CODE_EXECUTOR=true and CODE_EXECUTOR_URL to a secure sandbox service.',
        };
    }
    if (feature.id === 'voice_realtime' && !infrastructure.voiceRealtimeReady) {
        return {
            enabled: feature.existingImplementation === 'partial',
            status: feature.existingImplementation === 'partial' ? 'beta' : 'planned',
            reason: 'VOICE_STREAMING_NOT_CONFIGURED',
            hint: 'Chat voice mode works; set FEATURE_VOICE_REALTIME=true and speech provider keys for streaming.',
        };
    }
    if (feature.id === 'video_studio' && !infrastructure.videoGenerationReady) {
        return { enabled: false, status: 'disabled', reason: 'VIDEO_PROVIDER_NOT_CONFIGURED' };
    }
    const status = feature.existingImplementation === true
        ? 'available'
        : (feature.existingImplementation === 'partial' ? 'beta' : 'planned');
    return { enabled: true, status, reason: null };
}

async function getPlatformCapabilities(connection, email, access = {}) {
    const vector = await probePgVector(connection);
    const infrastructure = {
        databaseEngine: connection?.engine || 'sqlite',
        vector,
        storage: summarizeStoragePolicy(),
        codeExecutorReady: sandboxConfigured(),
        voiceRealtimeReady: voiceRealtimeConfigured(),
        videoGenerationReady: videoGenerationConfigured(),
        openAiEmbeddings: parseEnvBoolean('KB_USE_OPENAI_EMBEDDINGS', false)
            && Boolean(String(process.env.OPENAI_API_KEY || '').trim()),
    };

    const features = PLATFORM_FEATURES.map((feature) => {
        const state = resolveFeatureState(feature, { access, infrastructure });
        return {
            id: feature.id,
            name: feature.name,
            phase: feature.phase,
            description: feature.description,
            enabled: state.enabled,
            status: state.status,
            reason: state.reason,
            hint: state.hint || null,
            existingImplementation: feature.existingImplementation || false,
        };
    });

    return {
        version: 1,
        email: String(email || '').trim().toLowerCase(),
        mode: access.mode || 'user',
        isOwner: isOwner(access),
        plusActive: ownerPlusActive(access),
        infrastructure,
        features,
        jobTypes: Object.entries(JOB_TYPES).map(([type, meta]) => ({
            type,
            featureId: meta.featureId,
            label: meta.label,
            allowed: resolveFeatureState(getFeatureById(meta.featureId) || {}, { access, infrastructure }).enabled,
        })),
    };
}

function assertFeatureEnabled(capabilities, featureId) {
    const feature = capabilities.features.find((item) => item.id === featureId);
    if (!feature?.enabled) {
        const err = new Error(feature?.hint || `Feature "${featureId}" is not available on this deployment.`);
        err.status = 403;
        err.code = 'FEATURE_UNAVAILABLE';
        err.featureId = featureId;
        err.reason = feature?.reason;
        throw err;
    }
}

module.exports = {
    getPlatformCapabilities,
    assertFeatureEnabled,
    sandboxConfigured,
};
