function normalizeImageFields(raw) {
    const rawImage = raw.image || raw.imageUrl || (Array.isArray(raw.images) && raw.images[0]) || null;
    return rawImage;
}

const {
    applyVideoAttachmentToMessage,
    readVideoAttachment,
    VIDEO_ATTACHMENT_VERSION,
} = require('./chatVideoAttachment');

function createMessage(raw = {}) {
    const content = String(raw.content ?? raw.text ?? '');
    const message = {
        id: raw.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: raw.role === 'assistant' ? 'assistant' : 'user',
        content,
        text: content,
        timestamp: raw.timestamp || new Date().toISOString(),
    };

    const rawImage = normalizeImageFields(raw);
    if (rawImage) {
        message.image = rawImage;
        message.imageUrl = rawImage;
    }

    if (raw.imageQuality) message.imageQuality = raw.imageQuality;
    if (raw.imageAspect) message.imageAspect = raw.imageAspect;
    if (raw.imageSize) message.imageSize = raw.imageSize;
    if (raw.imageModel) message.imageModel = raw.imageModel;
    if (raw.imageMimeType) message.imageMimeType = raw.imageMimeType;
    if (typeof raw.upscaleSupported === 'boolean') message.upscaleSupported = raw.upscaleSupported;

    if (raw.videoAttachment?.version === VIDEO_ATTACHMENT_VERSION) {
        return applyVideoAttachmentToMessage(message, raw.videoAttachment);
    }

    if (raw.videoUrl) message.videoUrl = String(raw.videoUrl);
    if (raw.videoJobId) message.videoJobId = String(raw.videoJobId);
    if (raw.videoModel) message.videoModel = String(raw.videoModel);
    if (raw.videoAspect) message.videoAspect = String(raw.videoAspect);
    if (raw.videoResolution) message.videoResolution = String(raw.videoResolution);
    if (raw.videoMimeType) message.videoMimeType = String(raw.videoMimeType);
    if (typeof raw.generatingVideo === 'boolean') message.generatingVideo = raw.generatingVideo;
    if (raw.videoJobStatus) message.videoJobStatus = String(raw.videoJobStatus);

    if (raw.aiSticker && typeof raw.aiSticker === 'object' && raw.aiSticker.emoji) {
        message.aiSticker = {
            id: String(raw.aiSticker.id || 'emoji').slice(0, 40),
            emoji: String(raw.aiSticker.emoji).slice(0, 8),
            label: raw.aiSticker.label ? String(raw.aiSticker.label).slice(0, 60) : undefined,
            animated: raw.aiSticker.animated !== false,
        };
    }

    const attachment = readVideoAttachment(message);
    if (attachment && !message.videoUrl && attachment.playbackUrl) {
        message.videoUrl = attachment.playbackUrl;
    }

    return message;
}

function messageHasPersistableBody(message) {
    return Boolean(
        String(message.content || '').trim()
        || message.image
        || message.imageUrl
        || message.videoUrl
        || message.videoJobId
        || message.videoAttachment
        || message.generatingVideo,
    );
}

function normalizeMessages(messages) {
    return (Array.isArray(messages) ? messages : [])
        .map((entry) => createMessage(entry))
        .filter(messageHasPersistableBody)
        .slice(-20);
}

module.exports = {
    createMessage,
    normalizeMessages,
    messageHasPersistableBody,
};
