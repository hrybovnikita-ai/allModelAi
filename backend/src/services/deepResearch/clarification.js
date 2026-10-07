/**
 * Deep Research clarification (0–5 questions, skip when already specific).
 */

const SPECIFIC_PATTERNS = [
    /\bcompare\b.+\bwith\b/i,
    /\bofficial documentation\b/i,
    /\bpython\s*3\.\d+/i,
    /\bvs\.?\b/i,
    /\bbenchmark/i,
    /\bRFC\s?\d+/i,
    /\baccording to\b/i,
    /\busing (the )?(official|primary)\b/i,
];

const BROAD_PATTERNS = [
    /\b(best|top|recommend|find me|suggest|what should i|подбери|найди|лучш|рекоменд)\b/i,
    /\b(how to learn|learn|study|книг|курс)\b/i,
];

const normalizeQuestionShape = (raw, index) => {
    const id = String(raw.id || `q${index + 1}`).slice(0, 40);
    const prompt = String(raw.prompt || raw.question || '').trim().slice(0, 280);
    if (!prompt) return null;

    const type = ['single', 'multi', 'text'].includes(raw.type) ? raw.type : 'single';
    const options = Array.isArray(raw.options)
        ? raw.options.map((opt, optIndex) => ({
            id: String(opt.id || `opt${optIndex}`).slice(0, 40),
            label: String(opt.label || opt).slice(0, 120),
        })).filter((opt) => opt.label)
        : [];

    return {
        id,
        prompt,
        type: type === 'text' ? 'text' : type,
        options: type === 'text' ? [] : options.slice(0, 8),
        allowOther: raw.allowOther !== false && type !== 'text',
        optional: Boolean(raw.optional),
    };
};

const scoreSpecificity = (query) => {
    const text = String(query || '').trim();
    if (text.length >= 140) return 2;
    let score = 0;
    if (SPECIFIC_PATTERNS.some((re) => re.test(text))) score += 3;
    if (/\d{4}/.test(text)) score += 1;
    if (text.split(/\s+/).length >= 18) score += 2;
    if (BROAD_PATTERNS.some((re) => re.test(text)) && score < 2) score -= 2;
    return score;
};

const buildClarificationFromHeuristics = (query) => {
    const q = String(query || '').trim();
    const lower = q.toLowerCase();
    const questions = [];

    const asksBooks = /\b(book|books|книг|книги|книгу)\b/i.test(q);
    const asksLearn = /\b(learn|study|изуч|обуч)\b/i.test(q);
    const asksSenior = /\b(senior|experienced|опытн)\b/i.test(q);

    if (asksBooks || asksLearn) {
        questions.push({
            id: 'goal',
            prompt: 'What is your main goal?',
            type: 'single',
            options: [
                { id: 'learn', label: 'Learn fundamentals' },
                { id: 'interviews', label: 'Prepare for interviews' },
                { id: 'architecture', label: 'Improve architecture skills' },
                { id: 'depth', label: 'Go deeper on internals' },
            ],
            allowOther: true,
        });
        questions.push({
            id: 'resources',
            prompt: 'Which type of resources do you prefer?',
            type: 'multi',
            options: [
                { id: 'books', label: 'Books' },
                { id: 'courses', label: 'Courses' },
                { id: 'docs', label: 'Documentation' },
                { id: 'all', label: 'All' },
            ],
            allowOther: false,
        });
        questions.push({
            id: 'free',
            prompt: 'Should I prioritize free resources?',
            type: 'single',
            options: [
                { id: 'yes', label: 'Yes' },
                { id: 'no', label: 'No' },
                { id: 'both', label: 'Both' },
            ],
            allowOther: false,
        });
        questions.push({
            id: 'language',
            prompt: 'What language should the resources use?',
            type: 'single',
            options: [
                { id: 'en', label: 'English' },
                { id: 'uk', label: 'Ukrainian' },
                { id: 'ru', label: 'Russian' },
                { id: 'any', label: 'Any' },
            ],
            allowOther: false,
        });
        if (asksSenior) {
            questions.push({
                id: 'detail',
                prompt: 'How detailed should the final report be?',
                type: 'single',
                options: [
                    { id: 'concise', label: 'Concise' },
                    { id: 'detailed', label: 'Detailed' },
                    { id: 'comprehensive', label: 'Comprehensive' },
                ],
                allowOther: false,
            });
        }
    } else if (BROAD_PATTERNS.some((re) => re.test(q))) {
        questions.push({
            id: 'focus',
            prompt: 'What should I focus on most?',
            type: 'single',
            options: [
                { id: 'overview', label: 'High-level overview' },
                { id: 'actionable', label: 'Actionable recommendations' },
                { id: 'comparison', label: 'Compare options' },
                { id: 'latest', label: 'Latest developments' },
            ],
            allowOther: true,
        });
        questions.push({
            id: 'detail',
            prompt: 'How detailed should the final report be?',
            type: 'single',
            options: [
                { id: 'concise', label: 'Concise' },
                { id: 'detailed', label: 'Detailed' },
                { id: 'comprehensive', label: 'Comprehensive' },
            ],
            allowOther: false,
        });
    }

    if (/[а-яіїєґ]/i.test(q) && !questions.some((item) => item.id === 'language')) {
        questions.push({
            id: 'report_language',
            prompt: 'На каком языке оформить отчёт?',
            type: 'single',
            options: [
                { id: 'ru', label: 'Русский' },
                { id: 'uk', label: 'Українська' },
                { id: 'en', label: 'English' },
            ],
            allowOther: false,
            optional: true,
        });
    }

    void lower;
    return questions.slice(0, 5);
};

const mergeClarificationAnswers = (query, answers = {}) => {
    const parts = [String(query || '').trim()];
    Object.entries(answers || {}).forEach(([key, value]) => {
        if (value == null || value === '') return;
        if (Array.isArray(value)) {
            if (value.length) parts.push(`${key}: ${value.join(', ')}`);
            return;
        }
        parts.push(`${key}: ${String(value).trim()}`);
    });
    return parts.join('\n').slice(0, 2000);
};

const analyzeClarification = async ({ query, skipClarification = false, completeLlmJson = null }) => {
    const trimmed = String(query || '').trim();
    const specificity = scoreSpecificity(trimmed);

    if (skipClarification || specificity >= 3) {
        return {
            needsClarification: false,
            questions: [],
            topicTitle: trimmed.slice(0, 120),
            enrichedQuery: trimmed,
        };
    }

    let questions = [];
    if (specificity <= 1) {
        questions = buildClarificationFromHeuristics(trimmed);
    }

    if (completeLlmJson && specificity <= 2 && questions.length < 2) {
        try {
            const prompt = `Analyze whether clarifying questions would materially improve web research for:
"${trimmed.slice(0, 500)}"

Return JSON:
{
  "needsClarification": true|false,
  "topicTitle": "short title",
  "questions": [
    { "id": "x", "prompt": "...", "type": "single|multi|text", "options": [{"id":"a","label":"..."}], "allowOther": true, "optional": false }
  ]
}

Rules:
- Ask 0-5 questions only if ambiguity would hurt research quality.
- If the request is already specific (versions, official docs, benchmarks), set needsClarification false and questions [].
- Prefer chip-friendly single/multi options over long forms.`;

            const parsed = await completeLlmJson(prompt);
            if (parsed && parsed.needsClarification === false) {
                return {
                    needsClarification: false,
                    questions: [],
                    topicTitle: String(parsed.topicTitle || trimmed).slice(0, 120),
                    enrichedQuery: trimmed,
                };
            }
            const llmQuestions = Array.isArray(parsed?.questions)
                ? parsed.questions.map(normalizeQuestionShape).filter(Boolean)
                : [];
            if (llmQuestions.length) {
                questions = llmQuestions.slice(0, 5);
            }
        } catch {
            /* heuristic fallback */
        }
    }

    questions = questions.map(normalizeQuestionShape).filter(Boolean).slice(0, 5);

    if (!questions.length) {
        return {
            needsClarification: false,
            questions: [],
            topicTitle: trimmed.slice(0, 120),
            enrichedQuery: trimmed,
        };
    }

    return {
        needsClarification: true,
        questions,
        topicTitle: trimmed.slice(0, 120),
        enrichedQuery: trimmed,
    };
};

module.exports = {
    analyzeClarification,
    mergeClarificationAnswers,
    scoreSpecificity,
    buildClarificationFromHeuristics,
};
