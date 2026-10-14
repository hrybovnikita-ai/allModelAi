const {
    getMessageIdentityAsync,
    markMessageRevealedAsync,
    listRevealedMessageIdsAsync,
} = require('../services/anoninPersistence');
const { hasModelAccess } = require('../billing/accessControl');
const { getCreditStatusCoreAsync } = require('../billing/creditStatusAsync');
const { ANONIN_SLUG, normalizeVirtualChatModelSlug } = require('../services/anoninService');

/** POST /api/chat/anonim|anonymous — same as /api/chat with model=anonin. */
const postAnoninChatAlias = (req, res) => {
    req.body = { ...(req.body || {}), model: ANONIN_SLUG };
    const { createChatResponse } = require('./controllers');
    return createChatResponse(req, res);
};

async function revealAnoninMessage(req, res) {
    const messageId = String(req.body?.messageId || req.params?.messageId || '').trim();
    const conversationId = String(req.body?.conversationId || '').trim() || null;
    if (!messageId) {
        return res.status(400).json({ message: 'messageId is required.' });
    }
    const email = req.user.email;
    const row = await getMessageIdentityAsync(req.app.locals.db, email, messageId);
    if (!row) {
        return res.status(404).json({ message: 'Message identity not found or not ready to reveal.' });
    }
    if (conversationId && row.conversation_id && row.conversation_id !== conversationId) {
        return res.status(403).json({ message: 'Message does not belong to this conversation.' });
    }
    const creditStatus = await getCreditStatusCoreAsync(req.app.locals.db, email);
    if (!hasModelAccess(creditStatus, row.actual_slug)) {
        return res.status(403).json({
            message: 'You no longer have access to view which model answered this message.',
            code: 'REVEAL_NOT_PERMITTED',
        });
    }
    const revealed = await markMessageRevealedAsync(req.app.locals.db, email, messageId);
    if (!revealed) {
        return res.status(404).json({ message: 'Could not reveal this message.' });
    }
    return res.json({
        messageId: revealed.message_id,
        providerLabel: revealed.provider_label,
        modelLabel: revealed.model_label,
        actualSlug: revealed.actual_slug,
        strategy: revealed.strategy,
        fallbackFromSlug: revealed.fallback_from_slug || null,
        revealedAt: revealed.revealed_at,
        displayLine: `Answered by: ${revealed.provider_label} — ${revealed.model_label}`,
    });
}

/** GET /api/chat/:alias/revealed/:conversationId — alias must normalize to anonin. */
function gateAnoninRevealedAlias(req, res, next) {
    const alias = String(req.params.anoninAlias || req.params.modelAlias || '').trim();
    if (normalizeVirtualChatModelSlug(alias) !== ANONIN_SLUG) {
        return res.status(404).json({ message: 'Not found' });
    }
    return next();
}

async function listAnoninRevealed(req, res) {
    const conversationId = String(req.params.conversationId || '').trim();
    if (!conversationId) {
        return res.status(400).json({ message: 'conversationId is required.' });
    }
    const messageIds = await listRevealedMessageIdsAsync(
        req.app.locals.db,
        req.user.email,
        conversationId,
    );
    return res.json({ conversationId, messageIds });
}

module.exports = {
    revealAnoninMessage,
    listAnoninRevealed,
    postAnoninChatAlias,
    gateAnoninRevealedAlias,
};
