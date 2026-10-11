const { getJobForUser } = require('./videoJobStore');
const { isPostgresConnection } = require('../db/postgresHttpReads');
const { getConversationRowAsync, updateConversationRowAsync } = require('../db/postgresHttpChat');
const { normalizeMessages } = require('./chatMessageNormalize');
const { mergePersistedMessages } = require('./chatMessageMerge');
const {
    hydrateConversationMessages,
    rebuildMessagesFromConversationJobs,
    listJobsForConversation,
} = require('./chatVideoHydration');
const { assistantCompletionMessageForJob } = require('./chatVideoAttachment');

async function loadConversationMessages(connection, conversationId, email) {
    if (isPostgresConnection(connection)) {
        const row = await getConversationRowAsync(connection, conversationId, email);
        if (!row) return null;
        try {
            return JSON.parse(row.messages || '[]');
        } catch {
            return [];
        }
    }
    const data = connection.read();
    const conversation = (data.conversations || []).find(
        (item) => item.id === conversationId && item.email === email,
    );
    return conversation?.messages || null;
}

async function saveConversationMessages(connection, conversationId, email, messages) {
    const now = new Date().toISOString();
    if (isPostgresConnection(connection)) {
        await updateConversationRowAsync(connection, conversationId, email, {
            messages,
            updatedAt: now,
        });
        return;
    }
    const data = connection.read();
    const conversation = (data.conversations || []).find(
        (item) => item.id === conversationId && item.email === email,
    );
    if (!conversation) return;
    conversation.messages = messages;
    conversation.updatedAt = now;
    connection.write(data);
}

async function syncCompletedVideoJobToConversation(connection, email, jobId) {
    const job = await getJobForUser(connection, jobId, email);
    if (!job?.conversationId || job.status !== 'completed') return null;

    const normalizedEmail = String(email).trim().toLowerCase();
    const raw = await loadConversationMessages(connection, job.conversationId, normalizedEmail);
    if (raw === null) return null;

    const existing = normalizeMessages(raw);
    const mergedIncoming = mergePersistedMessages(existing, existing);
    let messages = await hydrateConversationMessages(
        connection,
        normalizedEmail,
        mergedIncoming,
        { conversationId: job.conversationId },
    );

    if (!messages.some((message) => message.videoJobId === job.id)) {
        const jobs = await listJobsForConversation(connection, normalizedEmail, job.conversationId);
        messages = rebuildMessagesFromConversationJobs(messages, jobs.length ? jobs : [job]);
        messages = await hydrateConversationMessages(
            connection,
            normalizedEmail,
            messages,
            { conversationId: job.conversationId },
        );
    }

    const before = JSON.stringify(existing);
    const after = JSON.stringify(messages);
    if (before !== after) {
        await saveConversationMessages(connection, job.conversationId, normalizedEmail, messages);
    }
    return messages;
}

module.exports = {
    syncCompletedVideoJobToConversation,
    saveConversationMessages,
    loadConversationMessages,
    assistantCompletionMessageForJob,
};
