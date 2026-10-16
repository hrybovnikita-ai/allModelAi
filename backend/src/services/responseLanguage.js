const { LANGUAGE_NAME_RE } = require('./chatIntent');

/** @typedef {{ code: string, label: string, source: 'auto'|'explicit'|'preference', confidence?: string }} ResolvedResponseLanguage */

const SUPPORTED = [
    { code: 'en', label: 'English' },
    { code: 'uk', label: 'Ukrainian' },
    { code: 'ru', label: 'Russian' },
    { code: 'es', label: 'Spanish' },
    { code: 'fr', label: 'French' },
    { code: 'de', label: 'German' },
    { code: 'pl', label: 'Polish' },
    { code: 'it', label: 'Italian' },
    { code: 'pt', label: 'Portuguese' },
    { code: 'zh', label: 'Chinese' },
    { code: 'ja', label: 'Japanese' },
    { code: 'ko', label: 'Korean' },
    { code: 'ar', label: 'Arabic' },
];

const CODE_TO_LABEL = Object.fromEntries(SUPPORTED.map((item) => [item.code, item.label]));

const NAME_TO_CODE = (() => {
    const map = {};
    for (const { code, label } of SUPPORTED) {
        map[label.toLowerCase()] = code;
        map[code] = code;
    }
    const aliases = {
        english: 'en', anglais: 'en', inglés: 'en', ingles: 'en', английском: 'en', английский: 'en',
        ukrainian: 'uk', українська: 'uk', українською: 'uk', украинский: 'uk', українською: 'uk',
        russian: 'ru', русский: 'ru', russisch: 'ru', русском: 'ru',
        spanish: 'es', español: 'es', espanol: 'es', castellano: 'es',
        french: 'fr', français: 'fr', francais: 'fr',
        german: 'de', deutsch: 'de', allemand: 'de', німецькою: 'de', немецком: 'de',
        polish: 'pl', polski: 'pl', polskim: 'pl', польською: 'pl', польском: 'pl',
        italian: 'it', italiano: 'it',
        portuguese: 'pt', português: 'pt', portugues: 'pt',
        chinese: 'zh', mandarin: 'zh', 中文: 'zh',
        japanese: 'ja', 日本語: 'ja',
        korean: 'ko', 한국어: 'ko',
        arabic: 'ar', العربية: 'ar',
        auto: 'auto',
    };
    return { ...map, ...aliases };
})();

const PREFERENCE_TO_CODE = {
    auto: 'auto',
    english: 'en',
    ukrainian: 'uk',
    russian: 'ru',
    spanish: 'es',
    french: 'fr',
    german: 'de',
    polish: 'pl',
    italian: 'it',
    portuguese: 'pt',
    chinese: 'zh',
    japanese: 'ja',
    korean: 'ko',
    arabic: 'ar',
    en: 'en', uk: 'uk', ru: 'ru', es: 'es', fr: 'fr', de: 'de', pl: 'pl', it: 'it', pt: 'pt', zh: 'zh', ja: 'ja', ko: 'ko', ar: 'ar',
};

const LATIN_STOPWORDS = {
    // Keep tokens length >= 3 in scoring (see scoreLatinLanguage) so articles like
    // Portuguese/Spanish "a"/"o"/"el" never flip English coding prompts to PT/ES.
    en: new Set([
        'the', 'and', 'you', 'your', 'need', 'teach', 'explain', 'what', 'how', 'why', 'when',
        'this', 'that', 'with', 'for', 'from', 'please', 'help', 'understand', 'syntax', 'about',
        'story', 'scary', 'tell', 'write', 'create', 'make', 'build', 'generate', 'implement',
        'function', 'calculate', 'numbers', 'number', 'using', 'into', 'should', 'would', 'could',
        'want', 'show', 'give', 'return', 'simple', 'example', 'code', 'script',
    ]),
    es: new Set(['los', 'las', 'que', 'por', 'para', 'como', 'necesito', 'explica', 'ayuda', 'este', 'esta', 'con', 'favor', 'escribe', 'función', 'calcular']),
    fr: new Set(['les', 'des', 'que', 'pour', 'avec', 'comment', 'explique', 'aide', 'moi', 'cette', 'écrire', 'fonction']),
    de: new Set(['der', 'die', 'das', 'und', 'ich', 'mit', 'für', 'wie', 'erkläre', 'hilf', 'mir', 'bitte', 'diese', 'dieser', 'schreibe', 'funktion']),
    pl: new Set(['jak', 'proszę', 'pomóż', 'wyjaśnij', 'tego', 'tej', 'moje', 'potrzebuję', 'opowiedz', 'historię', 'straszną', 'napisz', 'funkcję', 'obliczania']),
    it: new Set(['gli', 'che', 'per', 'come', 'spiega', 'aiuto', 'questo', 'questa', 'con', 'scrivi', 'funzione', 'calcolare']),
    pt: new Set(['que', 'para', 'como', 'explique', 'ajuda', 'meu', 'minha', 'preciso', 'escreva', 'função', 'calcular', 'números', 'número', 'favor']),
};

const RU_TOKENS = new Set([
    'расскажи', 'рассказ', 'мне', 'этот', 'эта', 'это', 'объясни', 'пожалуйста', 'историю', 'история', 'страшную', 'страшная', 'жуткую', 'жуткая',
    'ночь', 'ночью', 'привет', 'спасибо', 'русск', 'русском', 'ответь', 'скажи', 'хочу', 'нужно', 'давай', 'очень', 'сейчас', 'какой', 'какая', 'какое',
    'почему', 'зачем', 'когда', 'где', 'кто', 'что', 'который', 'мой', 'моя', 'моё', 'тебе', 'тебя', 'меня', 'напиши', 'сделай', 'помоги', 'как', 'дела', 'теперь', 'код',
]);

const UK_TOKENS = new Set([
    'розкажи', 'розповідь', 'мені', 'цей', 'ця', 'це', 'поясни', 'будь', 'ласка', 'історію', 'історія', 'страшну', 'страшна', 'жахливу', 'жахлива',
    'ніч', 'ночю', 'привіт', 'дякую', 'україн', 'українською', 'відповідай', 'скажи', 'хочу', 'потрібно', 'давай', 'дуже', 'зараз', 'який', 'яка', 'яке',
    'чому', 'навіщо', 'коли', 'де', 'хто', 'що', 'який', 'мій', 'моя', 'моє', 'тобі', 'тебе', 'мене', 'напиши', 'зроби', 'допоможи', 'як', 'справи', 'код',
]);

const EXPLICIT_PATTERNS = [
    /\b(?:translate|translation|переведи|переклади|traduce|traducir|traduire|übersetze|übersetzen)\b[^.?!\n]{0,120}?\b(?:to|into|на|en|auf|in)\s+([a-zA-Z\u00C0-\u024F\u0400-\u04FF\u4e00-\u9fff\u0600-\u06FF\- ]{2,32})/i,
    /\b(?:answer|reply|respond|write|explain|explica|expliquer|erkläre|erklare|поясни|объясни|ответь|відповідай)\b[^.?!\n]{0,80}?\b(?:in|en|auf|po|на)\s+([a-zA-Z\u00C0-\u024F\u0400-\u04FF\u4e00-\u9fff\u0600-\u06FF\- ]{2,32})/i,
    /\b(?:in|into|en|auf|на)\s+(english|german|spanish|french|ukrainian|russian|polish|italian|portuguese|chinese|japanese|korean|arabic|deutsch|español|espanol|français|francais|українськ|украинск|русск|английск|polski|polskim)\b/i,
    /(?:^|[\s,;])(?:но|but)\s+(?:ответь|answer|reply|respond|відповідай)[^.?!]{0,40}?(?:на|in)\s+(английском|english|англійською|ukrainian|українською|russian|русском|polish|polskim|deutsch|german|немецком)/i,
];

function normalizePreference(value) {
    const key = String(value || 'auto').trim().toLowerCase();
    return PREFERENCE_TO_CODE[key] || 'auto';
}

function resolveLanguageName(raw) {
    const cleaned = String(raw || '').trim().toLowerCase().replace(/[.!?]+$/g, '');
    if (!cleaned) return null;
    if (NAME_TO_CODE[cleaned]) return NAME_TO_CODE[cleaned];
    for (const [name, code] of Object.entries(NAME_TO_CODE)) {
        if (name.length >= 3 && cleaned.includes(name)) return code;
    }
    return null;
}

function parseExplicitResponseLanguage(text) {
    const sample = String(text || '');
    for (const pattern of EXPLICIT_PATTERNS) {
        const match = sample.match(pattern);
        if (!match) continue;
        const code = resolveLanguageName(match[1] || match[0]);
        if (code && code !== 'auto') {
            return { code, label: CODE_TO_LABEL[code] || code, source: 'explicit', confidence: 'high' };
        }
    }
    return null;
}

function stripProgrammingLanguageNoise(text) {
    return String(text || '')
        .replace(LANGUAGE_NAME_RE, ' ')
        .replace(/\b(programming|language|languages|syntax|code|coding)\b/gi, ' ');
}

/** Remove fenced code and inline code so detection uses the user's natural-language question. */
function stripTextForLanguageDetection(text) {
    return stripProgrammingLanguageNoise(String(text || ''))
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`[^`\n]+`/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function cyrillicTokens(text) {
    return (String(text || '').toLowerCase().match(/[\p{Script=Cyrillic}]+/gu) || []);
}

function scoreCyrillicLanguage(text) {
    const sample = String(text || '');
    let ru = 0;
    let uk = 0;
    for (const token of cyrillicTokens(sample)) {
        if (RU_TOKENS.has(token)) ru += 2;
        if (UK_TOKENS.has(token)) uk += 2;
    }
    if (/[ыэъё]/i.test(sample)) ru += 4;
    if (/[іїєґ]/i.test(sample)) uk += 4;
    if (/\b\w*ую\b/i.test(sample) || /\b\w*ий\b/i.test(sample) || /\b\w*ого\b/i.test(sample)) ru += 1;
    if (/\b\w*ну\b/i.test(sample) && !/[ыэъё]/i.test(sample)) uk += 1;
    return { ru, uk };
}

function scoreLatinLanguage(text) {
    const tokens = String(text || '').toLowerCase().match(/[\p{L}\p{M}']+/gu) || [];
    const scores = Object.fromEntries(Object.keys(LATIN_STOPWORDS).map((code) => [code, 0]));
    for (const token of tokens) {
        // Ignore 1–2 letter tokens: articles/prepositions collide across Romance languages
        // (pt "a", es "el"/"la", it "lo") and mis-route English prompts like
        // "Write a Python function…".
        if (token.length < 3) continue;
        for (const [code, words] of Object.entries(LATIN_STOPWORDS)) {
            if (words.has(token)) scores[code] += 1;
        }
    }
    let best = 'en';
    let bestScore = -1;
    for (const [code, score] of Object.entries(scores)) {
        if (score > bestScore) {
            best = code;
            bestScore = score;
        }
    }
    // English coding / imperative prompts often have few stopwords after stripping
    // language names ("Python"). Boost clear English anchors.
    const englishAnchors = (String(text || '').toLowerCase().match(
        /\b(write|create|explain|calculate|function|numbers|please|help|tell|show|implement|generate|build|using|should|would|could|what|how|why|when)\b/g,
    ) || []).length;
    if (englishAnchors > 0) {
        scores.en += englishAnchors;
        if (scores.en > bestScore || (scores.en === bestScore && best !== 'en')) {
            best = 'en';
            bestScore = scores.en;
        }
    }
    return { code: bestScore > 0 ? best : 'en', score: bestScore };
}

function detectScriptLanguageDetailed(text) {
    const sample = String(text || '');
    if (/[\u0600-\u06FF]/.test(sample)) return { code: 'ar', confidence: 'high' };
    if (/[\u3040-\u30FF]/.test(sample)) return { code: 'ja', confidence: 'high' };
    if (/[\uAC00-\uD7AF]/.test(sample)) return { code: 'ko', confidence: 'high' };
    if (/[\u4E00-\u9FFF]/.test(sample)) return { code: 'zh', confidence: 'high' };
    if (/[\u0400-\u04FF]/.test(sample)) {
        const { ru, uk } = scoreCyrillicLanguage(sample);
        const diff = Math.abs(ru - uk);
        if (diff >= 2) {
            return { code: ru > uk ? 'ru' : 'uk', confidence: 'high' };
        }
        if (ru > 0 || uk > 0) {
            return { code: ru >= uk ? 'ru' : 'uk', confidence: diff >= 1 ? 'high' : 'medium' };
        }
        return { code: 'ru', confidence: 'low' };
    }
    const latin = scoreLatinLanguage(sample);
    return {
        code: latin.code,
        confidence: latin.score >= 2 ? 'high' : latin.score >= 1 ? 'medium' : 'low',
    };
}

function wrapDetected(code, source = 'auto', confidence = 'high') {
    return {
        code,
        label: CODE_TO_LABEL[code] || code,
        source,
        confidence,
    };
}

function detectLanguageFromText(text) {
    const explicit = parseExplicitResponseLanguage(text);
    if (explicit) return explicit;
    const stripped = stripTextForLanguageDetection(text);
    const { code, confidence } = detectScriptLanguageDetailed(stripped || text);
    return wrapDetected(code, 'auto', confidence);
}

function isConfidentDetection(resolved) {
    return resolved?.confidence === 'high' || resolved?.confidence === 'medium';
}

function preferenceResolution(preference) {
    const code = normalizePreference(preference);
    if (code === 'auto') return null;
    return wrapDetected(code, 'preference', 'high');
}

function detectFromPriorUserMessages(priorMessages) {
    const prior = Array.isArray(priorMessages) ? priorMessages : [];
    for (let i = prior.length - 1; i >= 0; i -= 1) {
        const msg = prior[i];
        if (msg?.role !== 'user') continue;
        const content = stripTextForLanguageDetection(String(msg.content || ''));
        if (!content) continue;
        const detected = detectLanguageFromText(content);
        if (isConfidentDetection(detected)) return detected;
    }
    return null;
}

/**
 * @param {{ latestUserText: string, preference?: string, profileLanguage?: string, priorMessages?: Array<{role?: string, content?: string}> }} options
 * @returns {ResolvedResponseLanguage}
 */
function resolveResponseLanguage(options = {}) {
    const latestUserText = String(options.latestUserText || '');
    const preference = normalizePreference(options.preference);
    const profileLanguage = normalizePreference(options.profileLanguage);

    const explicit = parseExplicitResponseLanguage(latestUserText);
    if (explicit) return explicit;

    const strippedLatest = stripTextForLanguageDetection(latestUserText);
    const priorMessages = options.priorMessages;

    if (strippedLatest) {
        const detected = detectLanguageFromText(strippedLatest);
        if (isConfidentDetection(detected)) {
            return { ...detected, source: detected.source === 'explicit' ? 'explicit' : 'auto' };
        }
        // Low-confidence latest turns: prefer saved preference, then prior messages
        // only when they share the same language code as the weak detection.
        const pref = preferenceResolution(preference) || preferenceResolution(profileLanguage);
        if (pref) return pref;
        const fromContext = detectFromPriorUserMessages(priorMessages);
        if (fromContext && fromContext.code === detected.code) {
            return { ...fromContext, source: 'auto' };
        }
        // Keep the latest-message guess (usually English after Latin scoring)
        // instead of silently switching to an older Portuguese/Spanish turn.
        return { ...detected, source: 'auto' };
    }

    const fromContext = detectFromPriorUserMessages(priorMessages);
    if (fromContext) return { ...fromContext, source: 'auto' };

    const pref = preferenceResolution(preference) || preferenceResolution(profileLanguage);
    if (pref) return pref;

    return wrapDetected('en', 'auto', 'low');
}

const LANGUAGE_POLICY = `Respond in the same language as the user's latest message by default. If the user explicitly requests a different response language, follow that request. Preserve code syntax, proper nouns, technical identifiers, and quoted text when appropriate. Do not switch languages because of previous conversation history unless the current user message requests it.`;

function buildLanguageInstructionBlock(resolved) {
    const { code, label, source } = resolved || { code: 'en', label: 'English', source: 'auto' };
    const priority = source === 'explicit'
        ? 'The user explicitly requested this response language.'
        : source === 'preference'
            ? 'The user selected this response language in settings.'
            : 'Detected from the user\'s latest message (not browser UI language).';

    return `${LANGUAGE_POLICY}

Active response language: ${label} (${code}). ${priority}
Write the entire answer in ${label}. Earlier assistant replies in other languages must not override this rule. Mentioning a programming language (e.g. Python) is not a request to answer in that natural language.`;
}

function buildChatLanguageContext(options) {
    return require('./responseLanguagePolicy').buildChatLanguageContext(options);
}

module.exports = {
    SUPPORTED_RESPONSE_LANGUAGES: SUPPORTED,
    LANGUAGE_POLICY,
    buildChatLanguageContext,
    buildLanguageInstructionBlock,
    detectLanguageFromText,
    normalizePreference,
    parseExplicitResponseLanguage,
    resolveResponseLanguage,
    stripTextForLanguageDetection,
    scoreCyrillicLanguage,
};
