const { analyzeCode, suggestStaticFix } = require('../codeAssistant');

const MODES = new Set(['analyze', 'fix', 'explain', 'optimize']);

const postCodeAssist = (req, res) => {
    const mode = String(req.body?.mode || 'analyze');
    if (!MODES.has(mode)) {
        return res.status(400).json({ message: 'Mode must be analyze, fix, explain, or optimize.' });
    }
    try {
        const analysis = analyzeCode(req.body?.code, req.body?.language);
        const suggestion = mode === 'fix' || mode === 'optimize' ? suggestStaticFix(analysis) : null;
        return res.json({
            mode,
            ...analysis,
            suggestion,
            aiProviderUsed: false,
            note: mode === 'explain'
                ? 'This explanation is based on static checks only. The code was not executed.'
                : 'Static analysis only. The code was not executed and no provider API key was sent to the browser.',
        });
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.message || 'Could not analyze code.' });
    }
};

module.exports = { postCodeAssist };
