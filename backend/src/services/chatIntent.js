const LANGUAGE_NAME_RE = /\b(python|javascript|typescript|java|c\+\+|c#|csharp|go|golang|rust|php|swift|kotlin|ruby|scala|dart|react|vue|angular|node\.?js|fastapi|django|flask)\b/i;

const CODING_ACTION_RE = /\b(write|create|implement|build|generate|debug|fix|refactor|correct|rewrite|develop|program|script|deploy|port|convert|optimize|craft|design|make|add|remove|update|patch|solve|explain this (?:code|snippet|function)|here is my code|here'?s my code|this code|my code|sort an array|login component|calculator|api server|rest api|fastapi server)\b/i;

const CODE_ARTIFACT_RE = /\b(function|method|class|component|module|script|algorithm|endpoint|handler|middleware|snippet|program|app|game|server)\b/i;

const SUPPLIED_CODE_RE = /```[\s\S]*?```|(?:^|\s)(?:def |async def |function |class |import |from .+ import |const |let |var |public static|#include |package main)/m;

const RECOMMENDATION_RE = /\b(find|search|recommend|suggest|best|top|good|great|interesting|popular|where can i|where to|which|books?|courses?|tutorials?|resources|websites|sites|documentation|docs|reading list|learn(?:ing)?|study|beginners?|introductory|mooc|certification|textbooks?)\b/i;

const LEARNING_RESOURCE_RE = /\b(for learning|to learn|learning|beginner|introduction to|getting started|study guide|book list|course list|resource list)\b/i;

const INFORMATIONAL_RE = /^(what is|what'?s|who (?:created|invented|made|developed|founded)|when was|why is|how does|explain|describe|tell me about|define)\b/i;

const COMPARISON_RE = /\b(compare|comparison|versus|vs\.?|difference between|better than|pros and cons)\b/i;

const WEB_SEARCH_RE = /\b(find|search|recommend|best|latest|newest|where can i buy|official documentation|books?|courses?|websites|resources|price|pricing|cost|news|today|current|weather|release date|available now|buy|purchase|download link)\b/i;

const classifyChatIntent = (prompt) => {
    const text = String(prompt || '').trim();
    const lower = text.toLowerCase();

    const mentionsLanguage = LANGUAGE_NAME_RE.test(lower);
    const recommendation = RECOMMENDATION_RE.test(lower)
        || (LEARNING_RESOURCE_RE.test(lower) && mentionsLanguage);
    const informational = INFORMATIONAL_RE.test(lower)
        || /\bwhat is\b|\bwho (?:created|invented|made|developed)\b/i.test(lower);
    const comparison = COMPARISON_RE.test(lower);
    const suppliedCode = SUPPLIED_CODE_RE.test(text);

    const explicitCodingAction = CODING_ACTION_RE.test(lower)
        && (mentionsLanguage || CODE_ARTIFACT_RE.test(lower) || suppliedCode || /\b(code|coding|source code)\b/i.test(lower));

    const implementPhrase = /\b(write|create|implement|build|generate|fix|debug|refactor)\b/i.test(lower)
        && (CODE_ARTIFACT_RE.test(lower) || suppliedCode);

    let coding = explicitCodingAction || implementPhrase || (suppliedCode && CODING_ACTION_RE.test(lower));

    if (recommendation && !suppliedCode && !/\b(write|create|implement|build|generate|fix|debug|refactor)\b.*\b(function|class|component|script|code)\b/i.test(lower)) {
        coding = false;
    }
    if ((informational || comparison) && !suppliedCode && !/\b(write|create|implement|build|generate|fix|debug|refactor|code)\b/i.test(lower)) {
        coding = false;
    }
    if (/\b(books?|courses?|tutorials?|resources|websites|documentation)\b/i.test(lower) && !suppliedCode) {
        coding = false;
    }

    const webSearch = WEB_SEARCH_RE.test(lower) || recommendation
        || (informational && /\b(latest|current|official|documentation)\b/i.test(lower));

    let primary = 'general_chat';
    if (coding) primary = 'coding';
    else if (recommendation) primary = 'recommendation';
    else if (webSearch) primary = 'web_search';
    else if (comparison) primary = 'informational';
    else if (informational) primary = 'informational';

    return {
        primary,
        coding,
        webSearch,
        recommendation,
        informational: informational || comparison,
        comparison,
        mentionsLanguage,
    };
};

const needsWebSearchForPrompt = (prompt) => classifyChatIntent(prompt).webSearch;

module.exports = {
    classifyChatIntent,
    needsWebSearchForPrompt,
    LANGUAGE_NAME_RE,
};
