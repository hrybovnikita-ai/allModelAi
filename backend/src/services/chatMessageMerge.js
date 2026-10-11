const { createMessage } = require('./chatMessageNormalize');
const {
    extractVideoJobId,
    extractPlaybackUrl,
    applyVideoAttachmentToMessage,
    readVideoAttachment,
} = require('./chatVideoAttachment');
const { isVideoCompletionAssistantMessage } = require('./chatVideoHydration');

function mergeVideoFields(prior, incoming) {
    if (!prior) return incoming;
    const merged = createMessage({
        ...prior,
        ...incoming,
        content: incoming.content ?? incoming.text ?? prior.content,
        text: incoming.text ?? incoming.content ?? prior.text,
    });
    const jobId = incoming.videoJobId || prior.videoJobId
        || extractVideoJobId(incoming) || extractVideoJobId(prior);
    const videoUrl = incoming.videoUrl || prior.videoUrl
        || extractPlaybackUrl(incoming) || extractPlaybackUrl(prior);
    const attachment = readVideoAttachment(incoming) || readVideoAttachment(prior);
    if (jobId) merged.videoJobId = jobId;
    if (videoUrl) merged.videoUrl = videoUrl;
    if (attachment) {
        return applyVideoAttachmentToMessage(merged, {
            ...attachment,
            playbackUrl: videoUrl || attachment.playbackUrl,
            videoJobId: jobId || attachment.videoJobId,
        });
    }
    if (prior.videoModel && !merged.videoModel) merged.videoModel = prior.videoModel;
    if (prior.videoAspect && !merged.videoAspect) merged.videoAspect = prior.videoAspect;
    if (prior.videoResolution && !merged.videoResolution) merged.videoResolution = prior.videoResolution;
    if (prior.videoMimeType && !merged.videoMimeType) merged.videoMimeType = prior.videoMimeType;
    if (prior.generatingVideo && !merged.videoUrl && !merged.generatingVideo) {
        merged.generatingVideo = prior.generatingVideo;
    }
    if (prior.videoJobStatus && !merged.videoJobStatus) merged.videoJobStatus = prior.videoJobStatus;
    if (prior.aiSticker && !merged.aiSticker) merged.aiSticker = prior.aiSticker;
    return merged;
}

function findPriorMessage(existing, incoming, index) {
    if (incoming.id) {
        const byId = existing.find((item) => item.id === incoming.id);
        if (byId) return byId;
    }
    const jobId = extractVideoJobId(incoming);
    if (jobId) {
        const byJob = existing.find((item) => extractVideoJobId(item) === jobId);
        if (byJob) return byJob;
    }
    if (existing[index]) return existing[index];
    if (incoming.role === 'assistant' && isVideoCompletionAssistantMessage(incoming)) {
        return existing.find((item) => item.role === 'assistant' && isVideoCompletionAssistantMessage(item));
    }
    return null;
}

function mergePersistedMessages(existingRaw, incomingRaw) {
    const existing = (Array.isArray(existingRaw) ? existingRaw : []).map((entry) => createMessage(entry));
    const incoming = (Array.isArray(incomingRaw) ? incomingRaw : []).map((entry) => createMessage(entry));
    if (!existing.length) return incoming;
    return incoming.map((message, index) => {
        const prior = findPriorMessage(existing, message, index);
        return mergeVideoFields(prior, message);
    });
}

module.exports = {
    mergePersistedMessages,
    mergeVideoFields,
};
