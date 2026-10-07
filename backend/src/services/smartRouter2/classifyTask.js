const { classifyChatIntent } = require('../chatIntent');

const TASK_TYPES = [
    'greeting',
    'coding',
    'reasoning',
    'research',
    'writing',
    'summarization',
    'document_analysis',
    'vision',
    'translation',
    'general',
];

function isSimpleGreeting(prompt) {
    const text = String(prompt || '').trim().toLowerCase();
    if (!text || text.length > 40) return false;
    return /^(hi|hello|hey|привіт|привет|вітаю|добрий|good morning|good evening|yo|sup)[!.?\s]*$/i.test(text);
}

/**
 * @returns {{ taskType: string, needsKnowledge: boolean, needsMultiAgent: boolean, preferSpeed: boolean }}
 */
function classifyTask(prompt, options = {}) {
    const { hasImage = false, routerMode = 'balanced', useKnowledge = false } = options;
    const text = String(prompt || '').toLowerCase();

    if (isSimpleGreeting(prompt)) {
        return {
            taskType: 'greeting',
            needsKnowledge: false,
            needsMultiAgent: false,
            preferSpeed: true,
        };
    }

    if (hasImage || /\b(screenshot|image|photo|скрин|картин|фото)\b/i.test(text)) {
        return {
            taskType: 'vision',
            needsKnowledge: false,
            needsMultiAgent: false,
            preferSpeed: routerMode === 'speed',
        };
    }

    const intent = classifyChatIntent(prompt);

    if (/\btranslate|translation|перевод|переведи\b/i.test(text)) {
        return {
            taskType: 'translation',
            needsKnowledge: false,
            needsMultiAgent: false,
            preferSpeed: routerMode === 'speed',
        };
    }

    if (/\bsummarize|summary|tl;dr|коротко|резюме|підсумок\b/i.test(text)) {
        return {
            taskType: 'summarization',
            needsKnowledge: useKnowledge,
            needsMultiAgent: false,
            preferSpeed: routerMode === 'speed',
        };
    }

    if (intent.coding) {
        return {
            taskType: 'coding',
            needsKnowledge: useKnowledge,
            needsMultiAgent: text.length > 120,
            preferSpeed: routerMode === 'speed',
        };
    }

    if (intent.recommendation || intent.webSearch || intent.informational) {
        const complex = text.length > 180 || /\bcompare|versus|vs\.|analyze|evaluate|verify\b/i.test(text);
        return {
            taskType: 'research',
            needsKnowledge: useKnowledge,
            needsMultiAgent: complex,
            preferSpeed: routerMode === 'speed',
        };
    }

    if (text.length > 3500 || /\b(document|report|pdf|документ|отч[её]т)\b/i.test(text)) {
        return {
            taskType: 'document_analysis',
            needsKnowledge: true,
            needsMultiAgent: text.length > 500,
            preferSpeed: false,
        };
    }

    if (/\bwrite|rewrite|essay|story|email|стать|перепиш|письм\b/i.test(text) && !intent.informational) {
        return {
            taskType: 'writing',
            needsKnowledge: useKnowledge,
            needsMultiAgent: false,
            preferSpeed: routerMode === 'speed',
        };
    }

    if (routerMode === 'quality' || /\bprove|logic|step by step|reasoning|math|theorem\b/i.test(text)) {
        return {
            taskType: 'reasoning',
            needsKnowledge: useKnowledge,
            needsMultiAgent: text.length > 200,
            preferSpeed: false,
        };
    }

    return {
        taskType: 'general',
        needsKnowledge: useKnowledge,
        needsMultiAgent: false,
        preferSpeed: routerMode === 'speed' || routerMode === 'economy',
    };
}

module.exports = {
    TASK_TYPES,
    classifyTask,
    isSimpleGreeting,
};
