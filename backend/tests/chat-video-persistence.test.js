const test = require('node:test');
const assert = require('node:assert/strict');
const { createMessage, normalizeMessages } = require('../src/services/chatMessageNormalize');
const {
    attachJobToMessage,
    playbackUrlForJob,
    isVideoCompletionAssistantMessage,
    rebuildMessagesFromConversationJobs,
} = require('../src/services/chatVideoHydration');
const { mergePersistedMessages } = require('../src/services/chatMessageMerge');
const { buildVideoAttachmentFromJob } = require('../src/services/chatVideoAttachment');

test('createMessage preserves aiSticker metadata for chat history', () => {
    const message = createMessage({
        role: 'assistant',
        content: 'Hello!',
        aiSticker: { id: 'greeting', emoji: '😄', label: 'Greeting', animated: true },
    });
    assert.equal(message.aiSticker.emoji, '😄');
    assert.equal(message.aiSticker.id, 'greeting');
});

test('createMessage preserves video metadata for chat history', () => {
    const message = createMessage({
        role: 'assistant',
        text: 'Done! Here is your video.',
        videoUrl: '/api/video/jobs/vjob-abc/stream',
        videoJobId: 'vjob-abc',
        videoModel: 'ltx-2.5',
        videoAspect: '16:9',
        videoResolution: '480p',
        videoMimeType: 'video/mp4',
    });
    assert.equal(message.videoUrl, '/api/video/jobs/vjob-abc/stream');
    assert.equal(message.videoJobId, 'vjob-abc');
    assert.equal(message.videoResolution, '480p');
});

test('normalizeMessages keeps assistant video messages', () => {
    const messages = normalizeMessages([
        { role: 'user', text: 'Dragon prompt' },
        {
            role: 'assistant',
            text: 'Done! Here is your video.',
            videoUrl: '/api/video/jobs/vjob-1/stream',
            videoJobId: 'vjob-1',
        },
    ]);
    assert.equal(messages.length, 2);
    assert.equal(messages[1].videoJobId, 'vjob-1');
    assert.equal(messages[1].videoUrl, '/api/video/jobs/vjob-1/stream');
});

test('attachJobToMessage uses durable stream URL when file is stored', () => {
    const url = playbackUrlForJob({
        id: 'vjob-stored',
        status: 'completed',
        storedRelativePath: 'generated-videos/vjob-stored.mp4',
    });
    assert.equal(url, '/api/video/jobs/vjob-stored/stream');
    const message = attachJobToMessage(
        { role: 'assistant', content: 'Done! Here is your video.' },
        {
            id: 'vjob-stored',
            status: 'completed',
            storedRelativePath: 'generated-videos/vjob-stored.mp4',
            model: 'ltx-2.5',
            aspectRatio: '16:9',
            resolution: '480p',
            mimeType: 'video/mp4',
        },
    );
    assert.equal(message.videoUrl, '/api/video/jobs/vjob-stored/stream');
    assert.equal(message.videoModel, 'ltx-2.5');
});

test('isVideoCompletionAssistantMessage detects completion copy', () => {
    assert.equal(isVideoCompletionAssistantMessage({ role: 'assistant', content: 'Done! Here is your video.' }), true);
    assert.equal(isVideoCompletionAssistantMessage({ role: 'user', content: 'Done! Here is your video.' }), false);
});

test('mergePersistedMessages keeps video metadata when client sends text-only assistant row', () => {
    const existing = normalizeMessages([
        { role: 'user', text: 'Dragon' },
        {
            role: 'assistant',
            text: 'Done! Here is your video.',
            videoJobId: 'vjob-merge',
            videoUrl: '/api/video/jobs/vjob-merge/stream',
        },
    ]);
    const incoming = normalizeMessages([
        { role: 'user', text: 'Dragon' },
        { role: 'assistant', text: 'Done! Here is your video.' },
        { role: 'user', text: 'Thanks' },
        { role: 'assistant', text: 'Welcome.' },
    ]);
    const merged = mergePersistedMessages(existing, incoming);
    assert.equal(merged[1].videoJobId, 'vjob-merge');
    assert.equal(merged[1].videoUrl, '/api/video/jobs/vjob-merge/stream');
});

test('rebuildMessagesFromConversationJobs restores wiped conversation messages', () => {
    const rebuilt = rebuildMessagesFromConversationJobs([], [{
        id: 'vjob-rebuild',
        prompt: 'Golden dragon in the sky',
        status: 'completed',
        storedRelativePath: 'generated-videos/vjob-rebuild.mp4',
        model: 'ltx-2.5',
        aspectRatio: '16:9',
        resolution: '480p',
        mimeType: 'video/mp4',
    }]);
    assert.equal(rebuilt.length, 2);
    assert.equal(rebuilt[1].videoJobId, 'vjob-rebuild');
    assert.match(rebuilt[1].videoUrl, /\/api\/video\/jobs\/vjob-rebuild\/stream/);
});

test('buildVideoAttachmentFromJob prefers durable stream URL', () => {
    const attachment = buildVideoAttachmentFromJob({
        id: 'vjob-file',
        status: 'completed',
        storedRelativePath: 'generated-videos/vjob-file.mp4',
        model: 'ltx-2.5',
    });
    assert.equal(attachment.playbackUrl, '/api/video/jobs/vjob-file/stream');
});
