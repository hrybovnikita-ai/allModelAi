const APP_INSTRUCTIONS = `Generate a complete interactive browser website from the user's description.
You may create multiple HTML pages when the user asks for sections such as Home, About, Contact, Menu, Products, Pricing, etc.

Return one complete fenced code block per file using these fence labels:
- \`\`\`html or \`\`\`index.html for the home page (body content only, no <html> wrapper)
- \`\`\`about.html, \`\`\`menu.html, \`\`\`contact.html, etc. for additional pages (body content only)
- \`\`\`css or \`\`\`styles.css for shared styles used by every page
- \`\`\`javascript or \`\`\`js or \`\`\`script.js for shared client-side behavior

Use vanilla browser JavaScript and CSS only. No dependencies, imports, remote scripts, or network requests.
Implement navigation with relative links between generated pages, for example href="about.html" or href="./contact.html".
Only link to HTML files you actually generated. Do not link to missing pages.
Use a shared styles.css and script.js across all pages.
Implement interactions, validation, empty states, and responsive accessible layout.
Keep the project compact enough to finish every block. Never leave TODOs or pretend a backend is connected.
Use in-memory state in the preview. If persistence is useful, guard localStorage access with try/catch because the preview is sandboxed.
Do not use external images or APIs. Do not include secrets, authentication, or payment simulations presented as real services.`;

const MAX_REDESIGN_CONTEXT = 12000;

function prepareWebsiteRedesign(req, res, next) {
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    const files = req.body?.files;
    if (!prompt || prompt.length > 2000) {
        return res.status(400).json({ message: 'Describe the change in 1–2000 characters.' });
    }
    if (!files || typeof files !== 'object' || Array.isArray(files)) {
        return res.status(400).json({ message: 'Current project files are required.' });
    }
    const safeEntries = Object.entries(files)
        .filter(([name, value]) => (
            typeof name === 'string'
            && /^[a-zA-Z0-9._-]{1,80}$/.test(name)
            && typeof value === 'string'
            && value.length <= 80000
        ))
        .slice(0, 24);
    if (!safeEntries.length) {
        return res.status(400).json({ message: 'Project files were empty or used unsafe names.' });
    }
    let context = safeEntries.map(([name, value]) => `FILE ${name}\n${value}`).join('\n\n');
    if (context.length > MAX_REDESIGN_CONTEXT) context = context.slice(0, MAX_REDESIGN_CONTEXT);
    req.body = {
        model: 'smart',
        temporary: true,
        maxTokens: 8192,
        systemInstructions: `${APP_INSTRUCTIONS}\nUpdate the existing website to satisfy the latest request. Return the full updated file set as fenced blocks. Preserve pages and behavior that the request does not change.`,
        messages: [{ role: 'user', text: `Existing project:\n${context}\n\nChange request: ${prompt}` }],
    };
    next();
}

function prepareAppGeneration(req, res, next) {
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    if (!prompt || prompt.length > 4000) {
        return res.status(400).json({ message: 'Describe your application in 1–4000 characters.' });
    }
    req.body = {
        model: 'smart', temporary: true, maxTokens: 8192,
        systemInstructions: APP_INSTRUCTIONS,
        messages: [{ role: 'user', text: `Create a working browser website: ${prompt}\nReturn every HTML page plus styles.css and script.js as separate fenced code blocks.` }],
    };
    next();
}

module.exports = { prepareAppGeneration, prepareWebsiteRedesign };
