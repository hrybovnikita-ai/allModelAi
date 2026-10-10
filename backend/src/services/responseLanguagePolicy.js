/**
 * Central response-language policy: resolution metadata + provider instructions.
 */

const {
    resolveResponseLanguage,
    buildLanguageInstructionBlock,
    LANGUAGE_POLICY,
} = require('./responseLanguage');

const SOURCE_MAP = {
    explicit: 'explicit-user-message',
    auto: 'detected-user-message',
    preference: 'saved-preference',
};

const DIRECTIVES = {
    ru: 'Respond in natural Russian. Use Russian for the entire conversational response unless the user explicitly requests another language. Preserve code, proper nouns, technical terms, and quoted content when appropriate.',
    uk: 'Respond in natural Ukrainian. Use Ukrainian for the entire conversational response unless the user explicitly requests another language. Preserve code, proper nouns, technical terms, and quoted content when appropriate.',
    en: 'Respond in natural English unless the user explicitly requests another language. Preserve code, proper nouns, technical terms, and quoted content when appropriate.',
    pl: 'Respond in natural Polish unless the user explicitly requests another language.',
    de: 'Respond in natural German unless the user explicitly requests another language.',
    fr: 'Respond in natural French unless the user explicitly requests another language.',
    es: 'Respond in natural Spanish unless the user explicitly requests another language.',
    it: 'Respond in natural Italian unless the user explicitly requests another language.',
    pt: 'Respond in natural Portuguese unless the user explicitly requests another language.',
    zh: 'Respond in natural Chinese unless the user explicitly requests another language.',
    ja: 'Respond in natural Japanese unless the user explicitly requests another language.',
    ko: 'Respond in natural Korean unless the user explicitly requests another language.',
    ar: 'Respond in natural Arabic unless the user explicitly requests another language.',
};

function confidenceToNumber(confidence) {
    if (confidence === 'high') return 0.98;
    if (confidence === 'medium') return 0.82;
    if (confidence === 'low') return 0.55;
    return 0.7;
}

function toPolicyRecord(resolved) {
    const code = resolved?.code || 'en';
    const label = resolved?.label || 'English';
    const source = SOURCE_MAP[resolved?.source] || 'detected-user-message';
    return {
        language: code,
        label,
        source,
        confidence: confidenceToNumber(resolved?.confidence),
        directive: DIRECTIVES[code] || `Respond entirely in ${label} (${code}) unless the user explicitly requests another language.`,
        resolved,
    };
}

function buildChatLanguageContext(options = {}) {
    const resolved = resolveResponseLanguage(options);
    const policy = toPolicyRecord(resolved);
    const instructionBlock = `${buildLanguageInstructionBlock(resolved)}

${policy.directive}`;
    return {
        resolved,
        policy,
        instructionBlock,
        languagePolicy: LANGUAGE_POLICY,
    };
}

function buildProviderSystemPrompt(basePrompt, policy) {
    const p = policy || toPolicyRecord({ code: 'en', label: 'English', source: 'auto', confidence: 'low' });
    const header = `[MANDATORY RESPONSE LANGUAGE: ${p.label} (${p.language})]
${p.directive}
Do not answer in any other language for this turn. Earlier assistant messages in Ukrainian, English, or other languages must not override this rule.`;
    return `${header}

${String(basePrompt || '').trim()}

---
AllModelAI response language (mandatory): ${p.label} (${p.language}). ${p.directive}`;
}

function augmentMessagesForProvider(messages, policy) {
    const list = (Array.isArray(messages) ? messages : []).map((message) => ({ ...message }));
    if (!policy?.language) return list;
    for (let i = list.length - 1; i >= 0; i -= 1) {
        const row = list[i];
        if (row.role !== 'user') continue;
        const text = String(row.content || '').trim();
        if (!text) continue;
        list[i] = {
            ...row,
            content: `${text}\n\n[AllModelAI: reply entirely in ${policy.label} (${policy.language}) for this turn.]`,
        };
        break;
    }
    return list;
}

function logLanguageRouting(correlationId, meta = {}) {
    if (process.env.NODE_ENV === 'production' && process.env.ALLMODELAI_LANGUAGE_DEBUG !== '1') {
        return;
    }
    const safe = {
        correlationId: correlationId || 'none',
        language: meta.language,
        source: meta.source,
        confidence: meta.confidence,
        preference: meta.preference,
        selectedModel: meta.selectedModel,
        actualProvider: meta.actualProvider,
        fallback: Boolean(meta.fallback),
        systemLanguageApplied: meta.systemLanguageApplied !== false,
        languageInstructionIncluded: meta.languageInstructionIncluded !== false,
    };
    console.info('[LANGUAGE_ROUTING]', JSON.stringify(safe));
}

function providerPayloadIncludesLanguage(systemPrompt, policy) {
    const p = policy || {};
    const sample = String(systemPrompt || '');
    return sample.includes(`(${p.language})`) && sample.includes('MANDATORY RESPONSE LANGUAGE');
}

module.exports = {
    DIRECTIVES,
    augmentMessagesForProvider,
    buildChatLanguageContext,
    buildProviderSystemPrompt,
    logLanguageRouting,
    providerPayloadIncludesLanguage,
    toPolicyRecord,
};
