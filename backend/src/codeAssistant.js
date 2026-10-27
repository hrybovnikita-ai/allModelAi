const MAX_CODE_LENGTH = 20000;

const LANG_PATTERNS = [
    { language: 'python', test: (code) => /^(def |class |import |from |print\(|async def )/m.test(code) },
    { language: 'javascript', test: (code) => /^(const |let |function |import |export |console\.)/m.test(code) },
    { language: 'cpp', test: (code) => /#include\s*<(iostream|vector|string)>|std::/.test(code) },
    { language: 'c', test: (code) => /#include\s*<stdio\.h>/.test(code) },
    { language: 'csharp', test: (code) => /using\s+System|namespace\s+\w+/.test(code) },
    { language: 'java', test: (code) => /public\s+class\s+\w+|System\.out\.println/.test(code) },
    { language: 'html', test: (code) => /<!doctype html|<html|<div/i.test(code) },
    { language: 'css', test: (code) => /\{[^}]*:[^}]+;/.test(code) && !/function\s/.test(code) },
    { language: 'sql', test: (code) => /\b(SELECT|INSERT|UPDATE|DELETE)\b/i.test(code) },
];

function detectLanguage(code, hint) {
    const normalized = String(hint || '').toLowerCase();
    const aliases = {
        py: 'python', js: 'javascript', ts: 'javascript', jsx: 'javascript',
        cpp: 'cpp', 'c++': 'cpp', cs: 'csharp', htm: 'html',
    };
    if (aliases[normalized] || ['python', 'javascript', 'c', 'cpp', 'csharp', 'java', 'html', 'css', 'sql'].includes(normalized)) {
        return aliases[normalized] || normalized;
    }
    const match = LANG_PATTERNS.find((entry) => entry.test(code));
    return match?.language || 'text';
}

function balanceIssues(code, pairs, language) {
    const issues = [];
    pairs.forEach(([open, close]) => {
        const opens = (code.match(new RegExp(`\\${open}`, 'g')) || []).length;
        const closes = (code.match(new RegExp(`\\${close}`, 'g')) || []).length;
        if (opens !== closes) {
            issues.push({
                severity: 'confirmed',
                kind: 'syntax',
                message: `Unbalanced ${open}${close} in ${language} source. This was found by a static scan. The code was not executed.`,
            });
        }
    });
    return issues;
}

function analyzePython(code) {
    const confirmed = [];
    const possible = [];
    confirmed.push(...balanceIssues(code, [['(', ')'], ['[', ']'], ['{', '}']], 'Python'));
    if (/\bif\s+[^=\n]+=[^=]/.test(code)) {
        confirmed.push({
            severity: 'confirmed',
            kind: 'syntax',
            message: 'An if-condition uses a single =. Python comparisons need ==. The code was not executed.',
        });
    }
    if (/^\s*def\s+(print|len|list|dict|str|int|range|input)\s*\(/m.test(code)) {
        possible.push({
            severity: 'possible',
            kind: 'shadow-builtin',
            message: 'A function name matches a Python built-in. That can hide the built-in in this scope. Not confirmed as a runtime failure.',
        });
    }
    if (/\b[a-zA-Z_][a-zA-Z0-9_]*\s*\(/.test(code) && !/^\s*(import|from)\s+/m.test(code) && /\b(json|math|os|sys|re)\./.test(code)) {
        possible.push({
            severity: 'possible',
            kind: 'missing-import',
            message: 'A standard-library name is used without a visible import. Confirm the import exists above this snippet.',
        });
    }
    return { confirmed, possible };
}

function analyzeJavaScript(code) {
    const confirmed = [];
    const possible = [];
    try {
        // Compile only. The function is never called, so user code does not run.
        // eslint-disable-next-line no-new-func
        new Function(code);
    } catch (error) {
        confirmed.push({
            severity: 'confirmed',
            kind: 'syntax',
            message: `JavaScript syntax check failed: ${error.message}. The snippet was not executed.`,
        });
    }
    if (/\bvar\s+/.test(code)) {
        possible.push({
            severity: 'possible',
            kind: 'style',
            message: 'var is still valid. let or const is usually clearer. This is not a confirmed error.',
        });
    }
    return { confirmed, possible };
}

function analyzeCode(code, languageHint) {
    const source = String(code || '');
    if (!source.trim()) {
        const error = new Error('Code is required.');
        error.status = 400;
        throw error;
    }
    if (source.length > MAX_CODE_LENGTH) {
        const error = new Error('Code exceeds the 20,000 character limit.');
        error.status = 400;
        throw error;
    }
    const language = detectLanguage(source, languageHint);
    let confirmed = [];
    let possible = [];
    if (language === 'python') ({ confirmed, possible } = analyzePython(source));
    else if (language === 'javascript') ({ confirmed, possible } = analyzeJavaScript(source));
    else {
        confirmed.push(...balanceIssues(source, [['(', ')'], ['{', '}']], language));
        possible.push({
            severity: 'possible',
            kind: 'limited-checker',
            message: `Static checks for ${language} are limited to bracket balance. The code was not executed and was not sent to an AI provider by this checker.`,
        });
    }
    return {
        language,
        executed: false,
        confirmed,
        possible,
        original: source,
    };
}

function suggestStaticFix(analysis) {
    if (analysis.language === 'python' && analysis.confirmed.some((item) => /single =/.test(item.message))) {
        return {
            corrected: analysis.original.replace(/(\bif\s+[^=\n]+)=([^=])/, '$1==$2'),
            explanation: 'Replaced assignment in a condition with a comparison. Review the line before applying it.',
            appliedAutomatically: false,
        };
    }
    return {
        corrected: null,
        explanation: 'No automatic rewrite was produced. Use Fix Code in chat when an AI provider is available. Your original code was not changed.',
        appliedAutomatically: false,
    };
}

module.exports = {
    analyzeCode,
    detectLanguage,
    suggestStaticFix,
    MAX_CODE_LENGTH,
};
