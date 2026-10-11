const { getJobForUser } = require('./videoJobStore');
const { isPostgresConnection } = require('../db/postgresHttpReads');
const { queryPgPool, resolvePostgresAsyncPool } = require('../db/pgPoolQuery');
const { createMessage } = require('./chatMessageNormalize');
const {
    buildVideoAttachmentFromJob,
    applyVideoAttachmentToMessage,
    assistantCompletionMessageForJob,
    extractVideoJobId,
} = require('./chatVideoAttachment');

function playbackUrlForJob(job) {
    if (!job) return null;
    if (job.storedRelativePath) {
        return `/api/video/jobs/${job.id}/stream`;
    }
    if (job.videoUrl && String(job.videoUrl).startsWith('/api/')) {
        return job.videoUrl;
    }
    if (job.videoUrl && /^https?:\/\//i.test(job.videoUrl)) {
        return job.videoUrl;
    }
    return null;
}

function attachJobToMessage(message, job, { conversationId = null } = {}) {
    if (!job) return message;
    const activeStatuses = new Set(['preparing', 'queued', 'generating']);
    const attachment = buildVideoAttachmentFromJob(job, {
        conversationId,
        messageId: message.id,
    });
    if (activeStatuses.has(job.status)) {
        attachment.status = job.status;
        attachment.playbackUrl = null;
        return applyVideoAttachmentToMessage({
            ...message,
            generatingVideo: true,
            videoJobStatus: job.status,
        }, attachment);
    }
    if (job.status !== 'completed') {
        attachment.status = job.status;
        attachment.playbackUrl = null;
        return applyVideoAttachmentToMessage({
            ...message,
            generatingVideo: false,
            videoJobStatus: job.status,
        }, attachment);
    }
    const videoUrl = playbackUrlForJob(job);
    if (!videoUrl) return message;
    attachment.playbackUrl = videoUrl;
    attachment.status = 'completed';
    return applyVideoAttachmentToMessage({
        ...message,
        generatingVideo: false,
        videoJobStatus: 'completed',
    }, attachment);
}

function isVideoCompletionAssistantMessage(message) {
    if (!message || message.role !== 'assistant') return false;
    const text = String(message.content || message.text || '').trim().toLowerCase();
    return text.includes('here is your video') || text.includes('your video');
}

function rowToJob(row) {
    if (!row) return null;
    return {
        id: row.id,
        email: row.email,
        provider: row.provider,
        providerProjectId: row.provider_project_id ?? row.providerProjectId,
        mode: row.mode,
        prompt: row.prompt,
        status: row.status,
        aspectRatio: row.aspect_ratio ?? row.aspectRatio,
        resolution: row.resolution,
        model: row.model,
        durationSeconds: row.duration_seconds ?? row.durationSeconds,
        videoUrl: row.video_url ?? row.videoUrl,
        storedRelativePath: row.stored_relative_path ?? row.storedRelativePath,
        mimeType: row.mime_type ?? row.mimeType,
        conversationId: row.conversation_id ?? row.conversationId,
        messageId: row.message_id ?? row.messageId,
        createdAt: row.created_at ?? row.createdAt,
        updatedAt: row.updated_at ?? row.updatedAt,
    };
}

async function listRecentCompletedJobs(connection, email, { limit = 30 } = {}) {
    if (isPostgresConnection(connection)) {
        const result = await queryPgPool(
            resolvePostgresAsyncPool(connection),
            `SELECT * FROM video_generation_jobs
             WHERE lower(email) = lower($1) AND status = 'completed'
             ORDER BY created_at DESC
             LIMIT $2`,
            [email, limit],
        );
        return result.rows.map(rowToJob);
    }
    const rows = connection.database.prepare(`
        SELECT * FROM video_generation_jobs
        WHERE lower(email) = lower(?)
          AND status = 'completed'
        ORDER BY datetime(created_at) DESC
        LIMIT ?
    `).all(email, limit);
    return rows.map(rowToJob);
}

async function listJobsForConversation(connection, email, conversationId, { limit = 20 } = {}) {
    if (!conversationId) return [];
    if (isPostgresConnection(connection)) {
        const result = await queryPgPool(
            resolvePostgresAsyncPool(connection),
            `SELECT * FROM video_generation_jobs
             WHERE lower(email) = lower($1)
               AND conversation_id = $2
             ORDER BY created_at ASC
             LIMIT $3`,
            [email, conversationId, limit],
        );
        return result.rows.map(rowToJob);
    }
    const rows = connection.database.prepare(`
        SELECT * FROM video_generation_jobs
        WHERE lower(email) = lower(?)
          AND conversation_id = ?
        ORDER BY datetime(created_at) ASC
        LIMIT ?
    `).all(email, conversationId, limit);
    return rows.map(rowToJob);
}

function normalizePrompt(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function findJobForOrphanVideoMessage(message, userPrompt, completedJobs) {
    const promptKey = normalizePrompt(userPrompt);
    if (!promptKey) return null;
    return completedJobs.find((job) => {
        const jobPrompt = normalizePrompt(job.prompt);
        return jobPrompt === promptKey
            || jobPrompt.startsWith(promptKey.slice(0, 48))
            || promptKey.startsWith(jobPrompt.slice(0, 48));
    }) || null;
}

function messagesReferenceJob(messages, jobId) {
    return messages.some((message) => extractVideoJobId(message) === jobId);
}

function rebuildMessagesFromConversationJobs(messages, jobs) {
    let next = Array.isArray(messages) ? messages.map((entry) => createMessage(entry)) : [];
    if (!jobs.length) return next;

    for (const job of jobs) {
        if (messagesReferenceJob(next, job.id)) continue;

        const userIndex = next.findIndex(
            (message) => message.role === 'user'
                && normalizePrompt(message.content || message.text) === normalizePrompt(job.prompt),
        );
        const assistantMessage = assistantCompletionMessageForJob(job);

        if (userIndex >= 0) {
            const insertAt = userIndex + 1;
            const existingAssistant = next[insertAt];
            if (existingAssistant?.role === 'assistant' && isVideoCompletionAssistantMessage(existingAssistant)) {
                next[insertAt] = attachJobToMessage(existingAssistant, job, {
                    conversationId: job.conversationId,
                });
            } else {
                next.splice(insertAt, 0, assistantMessage);
            }
        } else if (!next.length) {
            next = [
                createMessage({
                    role: 'user',
                    content: job.prompt,
                    text: job.prompt,
                    timestamp: job.createdAt,
                }),
                assistantMessage,
            ];
        } else {
            next.push(assistantMessage);
        }
    }
    return next;
}

async function hydrateConversationMessages(connection, email, messages, { conversationId = null } = {}) {
    let working = Array.isArray(messages) ? messages.map((entry) => createMessage(entry)) : [];

    if (connection && email && conversationId) {
        const conversationJobs = await listJobsForConversation(connection, email, conversationId);
        working = rebuildMessagesFromConversationJobs(working, conversationJobs);
    }

    if (!working.length) return working;

    const jobIds = [...new Set(working.map((m) => extractVideoJobId(m)).filter(Boolean))];
    const jobsById = new Map();
    await Promise.all(jobIds.map(async (jobId) => {
        const job = await getJobForUser(connection, jobId, email);
        if (job) jobsById.set(jobId, job);
    }));

    let completedJobs = null;
    const needsOrphanMatch = working.some((message) => {
        const jobId = extractVideoJobId(message);
        return isVideoCompletionAssistantMessage(message)
            && !message.videoUrl
            && !(jobId && jobsById.has(jobId));
    });
    if (needsOrphanMatch) {
        completedJobs = await listRecentCompletedJobs(connection, email);
    }

    return working.map((message, index, all) => {
        const jobId = extractVideoJobId(message);
        if (jobId && jobsById.has(jobId)) {
            return attachJobToMessage(message, jobsById.get(jobId), { conversationId });
        }
        if (isVideoCompletionAssistantMessage(message) && !message.videoUrl && !jobId) {
            const userMessage = all[index - 1];
            const userPrompt = userMessage?.role === 'user'
                ? (userMessage.content || userMessage.text || '')
                : '';
            const matched = findJobForOrphanVideoMessage(message, userPrompt, completedJobs || []);
            if (matched) {
                return attachJobToMessage(message, matched, { conversationId });
            }
        }
        if (isVideoCompletionAssistantMessage(message) && !message.videoUrl && jobId && jobsById.has(jobId)) {
            return attachJobToMessage(message, jobsById.get(jobId), { conversationId });
        }
        return message;
    });
}

module.exports = {
    playbackUrlForJob,
    attachJobToMessage,
    hydrateConversationMessages,
    isVideoCompletionAssistantMessage,
    listJobsForConversation,
    rebuildMessagesFromConversationJobs,
};
