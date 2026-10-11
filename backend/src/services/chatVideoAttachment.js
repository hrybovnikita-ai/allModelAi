const VIDEO_ATTACHMENT_VERSION = 1;

const COMPLETION_COPY = 'Done! Here is your video.';

function streamUrlForJobId(jobId) {
    return `/api/video/jobs/${jobId}/stream`;
}

function buildVideoAttachmentFromJob(job, { conversationId = null, messageId = null } = {}) {
    if (!job?.id) return null;
    const playbackUrl = job.storedRelativePath
        ? streamUrlForJobId(job.id)
        : (job.videoUrl && String(job.videoUrl).startsWith('/api/')
            ? job.videoUrl
            : (job.status === 'completed' && job.storedRelativePath ? streamUrlForJobId(job.id) : null));
    return {
        version: VIDEO_ATTACHMENT_VERSION,
        id: `vatt-${job.id}`,
        videoJobId: job.id,
        conversationId: conversationId || job.conversationId || null,
        messageId: messageId || job.messageId || null,
        provider: job.provider || null,
        model: job.model || null,
        durationSeconds: job.durationSeconds ?? null,
        resolution: job.resolution || null,
        aspectRatio: job.aspectRatio || null,
        status: job.status || 'completed',
        playbackUrl: job.status === 'completed' ? playbackUrl : null,
        mimeType: job.mimeType || 'video/mp4',
        createdAt: job.createdAt || new Date().toISOString(),
    };
}

function applyVideoAttachmentToMessage(message, attachment) {
    if (!attachment) return message;
    const next = { ...message };
    next.videoAttachment = attachment;
    if (attachment.playbackUrl) next.videoUrl = attachment.playbackUrl;
    if (attachment.videoJobId) next.videoJobId = attachment.videoJobId;
    if (attachment.model) next.videoModel = attachment.model;
    if (attachment.aspectRatio) next.videoAspect = attachment.aspectRatio;
    if (attachment.resolution) next.videoResolution = attachment.resolution;
    if (attachment.mimeType) next.videoMimeType = attachment.mimeType;
    if (attachment.status) next.videoJobStatus = attachment.status;
    next.generatingVideo = ['preparing', 'queued', 'generating'].includes(attachment.status);
    return next;
}

function readVideoAttachment(message) {
    if (!message?.videoAttachment || message.videoAttachment.version !== VIDEO_ATTACHMENT_VERSION) {
        return null;
    }
    return message.videoAttachment;
}

function extractVideoJobId(message) {
    if (!message) return null;
    return message.videoJobId
        || readVideoAttachment(message)?.videoJobId
        || null;
}

function extractPlaybackUrl(message) {
    if (!message) return null;
    if (message.videoUrl) return message.videoUrl;
    const attachment = readVideoAttachment(message);
    return attachment?.playbackUrl || null;
}

function assistantCompletionMessageForJob(job, { messageId } = {}) {
    const attachment = buildVideoAttachmentFromJob(job, { messageId });
    return applyVideoAttachmentToMessage({
        id: messageId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: 'assistant',
        content: COMPLETION_COPY,
        text: COMPLETION_COPY,
        timestamp: job.updatedAt || job.createdAt || new Date().toISOString(),
    }, attachment);
}

module.exports = {
    VIDEO_ATTACHMENT_VERSION,
    COMPLETION_COPY,
    buildVideoAttachmentFromJob,
    applyVideoAttachmentToMessage,
    readVideoAttachment,
    extractVideoJobId,
    extractPlaybackUrl,
    assistantCompletionMessageForJob,
    streamUrlForJobId,
};
