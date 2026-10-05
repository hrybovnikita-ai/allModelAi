const { getOpenRouterApiKey } = require('../openRouterConfig');

const TUTOR_MODEL = (process.env.OPENAI_TRAINING_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();
const OPENROUTER_TUTOR_MODEL = (process.env.AI_TRAINING_TUTOR_OPENROUTER_MODEL || 'openrouter/free').trim();

function getOpenAiKey() {
    return (process.env.OPENAI_API_KEY || process.env.OPEN_AI_API_KEY || '').trim();
}

function tutorAvailability() {
    const openai = getOpenAiKey();
    const openrouter = getOpenRouterApiKey();
    return {
        available: Boolean(openai || openrouter),
        provider: openai ? 'openai' : openrouter ? 'openrouter' : null,
        model: openai ? TUTOR_MODEL : openrouter ? OPENROUTER_TUTOR_MODEL : null,
    };
}

function buildSystemPrompt(lessonContext = {}) {
    const title = lessonContext.title || lessonContext.lessonId || 'AI Training';
    const objectives = (lessonContext.objectives || []).join('; ');
    return (
        `You are the AllModelAI Training Tutor for the lesson "${title}". `
        + 'Explain concepts clearly with equations and Python when helpful. '
        + 'Give hints and step-by-step guidance for exercises; do not dump full final answers unless the user explicitly asks for the solution after trying. '
        + `Lesson context: ${lessonContext.summary || ''} Objectives: ${objectives}. `
        + 'If the user shares training metrics (loss, weight, bias), interpret them pedagogically.'
    );
}

async function chatCompletionsFetch(url, apiKey, body, extraHeaders = {}) {
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            ...extraHeaders,
        },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const message = data.error?.message || data.message || `Tutor request failed (${res.status})`;
        const err = new Error(message);
        err.status = res.status;
        throw err;
    }
    const text = data.choices?.[0]?.message?.content;
    if (!text) {
        throw new Error('Empty tutor response');
    }
    return text.trim();
}

async function askTutor({ message, lessonContext, history = [] }) {
    const trimmed = String(message || '').trim().slice(0, 4000);
    if (!trimmed) {
        return { ok: false, error: 'Message is required' };
    }

    const availability = tutorAvailability();
    if (!availability.available) {
        return {
            ok: false,
            unavailable: true,
            message: 'AI tutor unavailable — configure OPENAI_API_KEY or OpenRouter on the server.',
        };
    }

    const messages = [
        { role: 'system', content: buildSystemPrompt(lessonContext) },
        ...history.slice(-6).map((item) => ({
            role: item.role === 'assistant' ? 'assistant' : 'user',
            content: String(item.content || '').slice(0, 2000),
        })),
        { role: 'user', content: trimmed },
    ];

    const openaiKey = getOpenAiKey();
    try {
        if (openaiKey) {
            const answer = await chatCompletionsFetch(
                'https://api.openai.com/v1/chat/completions',
                openaiKey,
                {
                    model: TUTOR_MODEL,
                    temperature: 0.4,
                    max_tokens: 900,
                    messages,
                },
            );
            return { ok: true, answer, provider: 'openai', model: TUTOR_MODEL };
        }

        const orKey = getOpenRouterApiKey();
        const answer = await chatCompletionsFetch(
            'https://openrouter.ai/api/v1/chat/completions',
            orKey,
            {
                model: OPENROUTER_TUTOR_MODEL,
                temperature: 0.4,
                max_tokens: 900,
                messages,
            },
            {
                'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'https://allmodelai.app',
                'X-Title': 'AllModelAI Training Tutor',
            },
        );
        return { ok: true, answer, provider: 'openrouter', model: OPENROUTER_TUTOR_MODEL };
    } catch (error) {
        return {
            ok: false,
            error: error.message || 'Tutor failed',
            status: error.status,
        };
    }
}

module.exports = {
    askTutor,
    tutorAvailability,
    buildSystemPrompt,
};
