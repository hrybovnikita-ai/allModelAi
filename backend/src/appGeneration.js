const APP_INSTRUCTIONS = `Generate a complete interactive browser application from the user's description.
Return exactly three complete fenced code blocks: html, css, javascript. HTML must be body content only.
Use vanilla browser JavaScript and CSS, with no dependencies, imports, remote scripts or network requests.
Implement the requested interactions, validation, empty states and responsive accessible layout.
Keep the application compact enough to finish all three blocks. Never leave TODOs or pretend a backend is connected.
Use in-memory state in the preview. If persistence is useful, guard localStorage access with try/catch because the preview is sandboxed.
Do not use external images or APIs. Do not include secrets, authentication or payment simulations presented as real services.`;

function prepareAppGeneration(req, res, next) {
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    if (!prompt || prompt.length > 4000) {
        return res.status(400).json({ message: 'Describe your application in 1–4000 characters.' });
    }
    req.body = {
        model: 'smart', temporary: true, maxTokens: 4096,
        systemInstructions: APP_INSTRUCTIONS,
        messages: [{ role: 'user', text: `Create a working browser app: ${prompt}\nReturn complete html, css and javascript fenced blocks.` }],
    };
    next();
}

module.exports = { prepareAppGeneration };
