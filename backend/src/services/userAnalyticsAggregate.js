const FREE_MODELS = new Set(['gemini', 'cloudflare', 'gpt-oss', 'gpt-oss-groq', 'nemotron', 'deepseek-r1']);

function parseMessageList(raw) {
    if (Array.isArray(raw)) return raw;
    try {
        const parsed = JSON.parse(raw || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/**
 * Build the public /api/analytics payload from per-model SQL aggregates or legacy rows.
 * @param {Array<{ model: string, conversations?: number, messages?: number, characters?: number, messages?: string }>} rows
 */
function buildUsageAnalyticsPayload(rows) {
    const byModel = {};
    let conversations = 0;
    let messages = 0;
    let characters = 0;
    let freeConversations = 0;

    for (const row of rows || []) {
        const model = row.model || 'gpt';
        let convCount = Number(row.conversations ?? 0);
        let messageCount = Number(row.messages ?? 0);
        let charCount = Number(row.characters ?? 0);

        if (!convCount && row.messages != null && typeof row.messages !== 'number') {
            const list = parseMessageList(row.messages);
            convCount = 1;
            messageCount = list.length;
            charCount = list.reduce(
                (sum, item) => sum + String(item.content || item.text || '').length,
                0,
            );
        }

        conversations += convCount;
        messages += messageCount;
        characters += charCount;
        byModel[model] = (byModel[model] || 0) + convCount;
        if (FREE_MODELS.has(model)) {
            freeConversations += convCount;
        }
    }

    const estimatedTokens = Math.ceil(characters / 4);
    const paidRatio = conversations
        ? (conversations - freeConversations) / conversations
        : 0;
    const estimatedCost = Number((estimatedTokens / 1000000 * 2.4 * paidRatio).toFixed(4));

    return {
        conversations,
        messages,
        estimatedTokens,
        estimatedCost,
        estimatedSavings: Number((estimatedTokens / 1000000 * 2.4 - estimatedCost).toFixed(4)),
        freeConversations,
        paidConversations: conversations - freeConversations,
        byModel,
    };
}

module.exports = {
    FREE_MODELS,
    buildUsageAnalyticsPayload,
    parseMessageList,
};
