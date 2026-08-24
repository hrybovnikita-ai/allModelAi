const crypto = require('node:crypto');
const users = require('../data/data');

const sessionCookie = 'allmodelai_session';
const sessionDuration = 1000 * 60 * 60 * 24 * 30;
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const setSession = (req, res, user, remember = false) => {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + (remember ? sessionDuration : 1000 * 60 * 60 * 8);
    req.app.locals.db.database.prepare('INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(hashToken(token), user.id, expiresAt);
    res.cookie(sessionCookie, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', ...(remember ? { maxAge: sessionDuration } : {}) });
};

const createMessage = ({ role, text, content, id, timestamp }) => ({
    id: id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: role === 'assistant' ? 'assistant' : 'user',
    content: String(content ?? text ?? ''),
    timestamp: timestamp || new Date().toISOString(),
});

const normalizeMessages = (messages) => (Array.isArray(messages) ? messages : [])
    .map(createMessage)
    .filter((message) => message.content.trim())
    .slice(-20);

const createConversationTitle = (messages) => {
    const firstMessage = normalizeMessages(messages).find((message) => message.role === 'user')?.content || '';
    const cleaned = firstMessage.replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
    if (!cleaned) return 'New conversation';
    if (/\b(torch|pytorch)\b/i.test(cleaned) && /\b(agent|ai)\b/i.test(cleaned)) return 'AI Agent with PyTorch';
    if (/\bjwt\b/i.test(cleaned) && /auth/i.test(cleaned)) return 'JWT Authentication';
    if (/react\s+useeffect/i.test(cleaned)) return 'React useEffect';

    const title = cleaned
        .replace(/^please\s+/i, '')
        .replace(/^(make me|create|build|write|show me|explain)\s+/i, '')
        .trim();
    return title.length > 48 ? `${title.slice(0, 48).trimEnd()}...` : title;
};

const getConversationPayload = (conversation) => ({
    ...conversation,
    title: conversation.title || createConversationTitle(conversation.messages),
    messages: normalizeMessages(conversation.messages),
});

const saveUsers = (database) => {
    const data = database.read();
    data.users = users;
    database.write(data);
};

const registerUser = (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ message: 'Name, email and password are required' });
    }

    if (password.length < 8) {
        return res.status(400).json({ message: 'Password must contain at least 8 characters' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (users.some((user) => user.email.toLowerCase() === normalizedEmail)) {
        return res.status(409).json({ message: 'An account with this email already exists' });
    }

    const newUser = {
        id: users.length ? Math.max(...users.map((user) => user.id)) + 1 : 1,
        name: name.trim(),
        email: normalizedEmail,
    };

    users.push(newUser);
    saveUsers(req.app.locals.db);
    console.log('[AUTH REGISTER]', newUser);

    setSession(req, res, newUser, req.body.rememberMe === true || req.body.rememberMe === 'true');
    return res.status(201).json({
        message: 'Account created successfully',
        user: newUser,
    });
};

const loginUser = (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    let user = users.find(
        (item) => item.email.toLowerCase() === email.trim().toLowerCase()
    );

    if (!user) {
        const emailName = normalizedEmail
            .split('@')[0]
            .replace(/[._-]+/g, ' ')
            .replace(/\b\w/g, (letter) => letter.toUpperCase());

        user = {
            id: users.length ? Math.max(...users.map((item) => item.id)) + 1 : 1,
            name: emailName || 'New User',
            email: normalizedEmail,
        };

        users.push(user);
        saveUsers(req.app.locals.db);
    }

    console.log('[AUTH SIGN IN]', user);
    setSession(req, res, user, req.body.rememberMe === true || req.body.rememberMe === 'true');

    return res.status(200).json({
        message: 'Signed in successfully',
        user,
    });
};

const providerNames = { google: 'Google', apple: 'Apple', facebook: 'Facebook' };

const getSocialAccounts = (req, res) => {
    const provider = String(req.params.provider || '').toLowerCase();
    if (!providerNames[provider]) return res.status(400).json({ message: 'Unsupported sign-in provider' });
    const accounts = users.slice(0, provider === 'google' ? 3 : 1).map((user) => ({
        id: `${provider}-${user.id}`,
        name: user.name,
        email: user.email,
        provider: providerNames[provider],
    }));
    return res.status(200).json({ provider: providerNames[provider], accounts });
};

const socialLogin = (req, res) => {
    const provider = String(req.body.provider || '').toLowerCase();
    const accountId = String(req.body.accountId || '');
    if (!providerNames[provider] || !accountId.startsWith(`${provider}-`)) return res.status(400).json({ message: 'A valid provider account is required' });
    const sourceUser = users.find((user) => user.id === Number(accountId.slice(provider.length + 1)));
    if (!sourceUser) return res.status(404).json({ message: 'Provider account was not found' });
    const user = { ...sourceUser, provider: providerNames[provider] };
    setSession(req, res, user, true);
    return res.status(200).json({ message: `Signed in with ${providerNames[provider]}`, user });
};

const googleRedirectUri = () => process.env.GOOGLE_REDIRECT_URI || `${process.env.BACKEND_ORIGIN || 'http://localhost:5050'}/api/auth/google/callback`;
const frontendOrigin = () => process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

const startGoogleAuth = (req, res) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        return res.status(503).send('Google sign-in is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to backend/.env.');
    }
    const state = crypto.randomBytes(24).toString('hex');
    res.cookie('allmodelai_oauth_state', state, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 10 * 60 * 1000 });
    const query = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: googleRedirectUri(), response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account' });
    return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${query}`);
};

const googleCallback = async (req, res) => {
    const expectedState = req.cookies?.allmodelai_oauth_state;
    res.clearCookie('allmodelai_oauth_state', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    if (!req.query.code || !expectedState || req.query.state !== expectedState) return res.status(400).send('Google sign-in could not be verified. Please try again.');
    try {
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: req.query.code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: googleRedirectUri(), grant_type: 'authorization_code' }) });
        const tokens = await tokenResponse.json();
        if (!tokenResponse.ok || !tokens.access_token) throw new Error('Google token exchange failed');
        const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
        const profile = await profileResponse.json();
        if (!profileResponse.ok || !profile.email || profile.email_verified === false) throw new Error('Google profile verification failed');
        const normalizedEmail = profile.email.trim().toLowerCase();
        let user = users.find((item) => item.email.toLowerCase() === normalizedEmail);
        if (!user) {
            user = { id: users.length ? Math.max(...users.map((item) => item.id)) + 1 : 1, name: profile.name || normalizedEmail.split('@')[0], email: normalizedEmail };
            users.push(user);
            saveUsers(req.app.locals.db);
        }
        setSession(req, res, user, true);
        return res.redirect(`${frontendOrigin()}/dashboard`);
    } catch (error) {
        console.error('[AUTH GOOGLE ERROR]', error.message);
        return res.redirect(`${frontendOrigin()}/?authError=google`);
    }
};

const getSession = (req, res) => {
    const token = req.cookies?.[sessionCookie];
    if (!token) return res.status(401).json({ message: 'No active session' });
    const user = req.app.locals.db.database.prepare('SELECT users.id, users.name, users.email FROM auth_sessions JOIN users ON users.id = auth_sessions.user_id WHERE token_hash = ? AND expires_at > ?').get(hashToken(token), Date.now());
    if (!user) return res.status(401).json({ message: 'Session expired' });
    return res.status(200).json({ user });
};

const logout = (req, res) => {
    const token = req.cookies?.[sessionCookie];
    if (token) req.app.locals.db.database.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(hashToken(token));
    res.clearCookie(sessionCookie, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    return res.status(204).send();
};

const getUsers = (req, res) => {
    res.status(200).json(users);
};

const getUserById = (req, res) => {
    const id = Number(req.params.id);
    const user = users.find((item) => item.id === id);

    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json(user);
};

const createUser = (req, res) => {
    const { name, email } = req.body;

    if (!name || !email) {
        return res.status(400).json({ message: 'Name and email are required' });
    }

    const emailExists = users.some(
        (user) => user.email.toLowerCase() === email.toLowerCase()
    );

    if (emailExists) {
        return res.status(409).json({ message: 'A user with this email already exists' });
    }

    const newUser = {
        id: users.length ? Math.max(...users.map((user) => user.id)) + 1 : 1,
        name: name.trim(),
        email: email.trim().toLowerCase(),
    };

    users.push(newUser);
    saveUsers(req.app.locals.db);
    return res.status(201).json(newUser);
};

const updateUser = (req, res) => {
    const id = Number(req.params.id);
    const user = users.find((item) => item.id === id);
    const { name, email } = req.body;

    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }

    if (!name || !email) {
        return res.status(400).json({ message: 'Name and email are required' });
    }

    user.name = name.trim();
    user.email = email.trim().toLowerCase();
    saveUsers(req.app.locals.db);
    return res.status(200).json(user);
};

const patchUser = (req, res) => {
    const id = Number(req.params.id);
    const user = users.find((item) => item.id === id);

    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }

    if (req.body.name !== undefined) user.name = req.body.name.trim();
    if (req.body.email !== undefined) user.email = req.body.email.trim().toLowerCase();

    saveUsers(req.app.locals.db);
    return res.status(200).json(user);
};

const deleteUser = (req, res) => {
    const id = Number(req.params.id);
    const index = users.findIndex((item) => item.id === id);

    if (index === -1) {
        return res.status(404).json({ message: 'User not found' });
    }

    const [deletedUser] = users.splice(index, 1);
    saveUsers(req.app.locals.db);
    return res.status(200).json({
        message: 'User deleted successfully',
        user: deletedUser,
    });
};

const deleteAccount = (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const index = users.findIndex((user) => user.email.toLowerCase() === email);
    if (index === -1) return res.status(404).json({ message: 'Account not found' });

    const [deletedUser] = users.splice(index, 1);
    const data = req.app.locals.db.read();
    data.users = users;
    data.conversations = (data.conversations || []).filter((conversation) => conversation.email !== email);
    data.purchases = (data.purchases || []).filter((purchase) => purchase.email !== email);
    if (data.subscriptions) delete data.subscriptions[email];
    if (data.usage) delete data.usage[email];
    req.app.locals.db.write(data);
    req.app.locals.db.database.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(deletedUser.id);
    res.clearCookie(sessionCookie, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });

    return res.status(200).json({ message: 'Account deleted successfully', user: deletedUser });
};

const creditLimits = { free: 10, common: 100, plus: 1000 };

const getCreditStatus = (database, email) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const data = database.read();
    data.subscriptions ||= {};
    data.usage ||= {};
    const plan = data.subscriptions[normalizedEmail] || 'free';
    const limit = creditLimits[plan] || creditLimits.free;
    const used = Number(data.usage[normalizedEmail] || 0);

    return { data, email: normalizedEmail, plan, limit, used, remaining: Math.max(limit - used, 0) };
};

const getModelStatus = (_req, res) => res.status(200).json({
    updatedAt: new Date().toISOString(),
    models: { gpt: Boolean(process.env.OPENROUTER_API_KEY || process.env.API_KEY), gemini: Boolean(process.env.GEMINI_API_KEY), claude: Boolean(process.env.CLAUDE_API_KEY), cloudflare: Boolean((process.env.CLOUDFLARE_API_KEY || process.env.CLAUDEFLARE_API_KEY) && process.env.CLOUDFLARE_ACCOUNT_ID), others: Boolean(process.env.OPENROUTER_API_KEY || process.env.API_KEY) },
});

const getAdminStats = (req, res) => {
    if (!process.env.ADMIN_KEY) return res.status(503).json({ message: 'Admin access is not configured' });
    if (req.get('x-admin-key') !== process.env.ADMIN_KEY) return res.status(401).json({ message: 'Invalid admin key' });
    const data = req.app.locals.db.read();
    return res.status(200).json({ users: data.users.length, conversations: data.conversations.length, purchases: data.purchases.length, activeSessions: req.app.locals.db.database.prepare('SELECT COUNT(*) AS count FROM auth_sessions WHERE expires_at > ?').get(Date.now()).count });
};

const getCredits = (req, res) => {
    if (!req.query.email) return res.status(400).json({ message: 'Email is required' });
    const status = getCreditStatus(req.app.locals.db, req.query.email);
    return res.status(200).json({ plan: status.plan, limit: status.limit, used: status.used, remaining: status.remaining, unlimited: false });
};

const getChatHistory = (req, res) => {
    const email = String(req.query.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const data = req.app.locals.db.read();
    const conversations = (data.conversations || [])
        .filter((conversation) => conversation.email === email)
        .map(getConversationPayload)
        .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
    return res.status(200).json(conversations);
};

const createChatHistory = (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const model = String(req.body.model || 'gpt');
    const messages = normalizeMessages(req.body.messages);
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const now = new Date().toISOString();
    const conversation = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        email,
        model,
        title: createConversationTitle(messages),
        messages,
        createdAt: now,
        updatedAt: now,
    };
    const data = req.app.locals.db.read();
    data.conversations ||= [];
    data.conversations.push(conversation);
    req.app.locals.db.write(data);
    return res.status(201).json(conversation);
};

const renameChat = (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const title = req.body.title === undefined ? undefined : String(req.body.title).trim().slice(0, 60);
    const messages = Array.isArray(req.body.messages) ? normalizeMessages(req.body.messages) : undefined;
    if (!email || (!title && !messages)) return res.status(400).json({ message: 'Email and title or messages are required' });

    const data = req.app.locals.db.read();
    const conversation = (data.conversations || []).find((item) => item.id === req.params.id && item.email === email);
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });

    if (title) conversation.title = title;
    if (messages) conversation.messages = messages;
    conversation.updatedAt = new Date().toISOString();
    req.app.locals.db.write(data);
    return res.status(200).json(getConversationPayload(conversation));
};

const deleteChat = (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const data = req.app.locals.db.read();
    const index = (data.conversations || []).findIndex((item) => item.id === req.params.id && item.email === email);
    if (index === -1) return res.status(404).json({ message: 'Conversation not found' });

    data.conversations.splice(index, 1);
    req.app.locals.db.write(data);
    return res.status(200).json({ message: 'Conversation deleted successfully' });
};

const createPurchase = (req, res) => {
    const { name, email, password, city, dateOfBirth, plan } = req.body;

    if (!name || !email || !password || !city || !dateOfBirth || !plan) {
        return res.status(400).json({ message: 'All purchase fields are required' });
    }

    const database = req.app.locals.db;
    const normalizedPlan = String(plan).trim().toLowerCase();
    const planKey = normalizedPlan === 'starter' || normalizedPlan === 'free'
        ? 'free'
        : normalizedPlan === 'pro' || normalizedPlan === 'common' ? 'common' : 'plus';
    const data = database.read();
    data.subscriptions ||= {};
    data.usage ||= {};
    const purchase = {
        id: data.purchases.length ? Math.max(...data.purchases.map((item) => item.id)) + 1 : 1,
        plan: planKey,
        name: String(name).trim(),
        email: String(email).trim().toLowerCase(),
        city: String(city).trim(),
        dateOfBirth: String(dateOfBirth),
        createdAt: new Date().toISOString(),
    };

    data.purchases.push(purchase);
    data.subscriptions[purchase.email] = planKey;
    data.usage[purchase.email] = 0;
    database.write(data);

    return res.status(201).json({ message: 'Purchase saved successfully', purchase });
};

const createChatResponse = async (req, res) => {
    const { messages, model = 'gpt', userEmail, conversationId, temporary = false, routerMode = 'balanced' } = req.body;
    const providerModels = {
        gpt: 'openai/gpt-4o-mini',
        claude: 'anthropic/claude-3.5-haiku',
        gemini: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
        grok: 'x-ai/grok-4.3',
        copilot: 'openai/gpt-4o-mini',
        perplexity: 'perplexity/sonar',
        kimi: 'moonshotai/kimi-k2',
        deepseek: 'deepseek/deepseek-chat',
        llama: 'meta-llama/llama-3.3-70b-instruct',
        mistral: 'mistralai/mistral-small-3.1-24b-instruct',
        qwen: 'qwen/qwen-2.5-72b-instruct',
        cohere: 'cohere/command-r-plus',
        cloudflare: process.env.CLOUDFLARE_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    };
    const configuredGrokModel = process.env.GROK_MODEL?.trim();
    const grokModel = configuredGrokModel && !/grok-3-mini/i.test(configuredGrokModel)
        ? configuredGrokModel
        : providerModels.grok;
    const latestPrompt = String(messages?.at(-1)?.text || messages?.at(-1)?.content || '').toLowerCase();
    const routedModel = model === 'smart'
        ? (routerMode === 'speed' || routerMode === 'economy' ? 'gemini'
            : routerMode === 'quality' ? (/code|debug|function|react|javascript|python|api/.test(latestPrompt) ? 'deepseek' : 'claude')
            : /code|debug|function|react|javascript|python|api/.test(latestPrompt) ? 'deepseek'
            : /research|latest|source|news|find|citation/.test(latestPrompt) ? 'perplexity'
                : /write|rewrite|essay|story|email/.test(latestPrompt) ? 'claude' : 'gpt')
        : model;

    const isClaude = routedModel === 'claude';
    const isGemini = routedModel === 'gemini';
    const isCloudflare = routedModel === 'cloudflare';
    const cloudflareKey = process.env.CLOUDFLARE_API_KEY || process.env.CLAUDEFLARE_API_KEY;
    const apiKey = isClaude ? process.env.CLAUDE_API_KEY : isGemini ? process.env.GEMINI_API_KEY : isCloudflare ? cloudflareKey : (process.env.OPENROUTER_API_KEY || process.env.API_KEY);
    if (!apiKey) {
        return res.status(503).json({ message: `${isClaude ? 'The Claude' : isGemini ? 'The Gemini' : isCloudflare ? 'The Cloudflare' : 'The OpenRouter'} API key is not configured` });
    }
    if (isCloudflare && !process.env.CLOUDFLARE_ACCOUNT_ID) return res.status(503).json({ message: 'CLOUDFLARE_ACCOUNT_ID is not configured in backend/.env' });
    if (!providerModels[routedModel]) {
        return res.status(400).json({ message: 'Unsupported AI model' });
    }
    if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ message: 'At least one message is required' });
    }

    if (!userEmail) return res.status(400).json({ message: 'User email is required' });
    const creditStatus = getCreditStatus(req.app.locals.db, userEmail);
    if (creditStatus.used >= creditStatus.limit) return res.status(429).json({ message: `Your ${creditStatus.plan} plan has reached its request limit. Choose a larger plan to continue.` });

    const input = normalizeMessages(messages).map(({ role, content }) => ({
        role: role === 'assistant' ? 'assistant' : 'user',
        content: content.slice(0, 8000),
    }));
    const memoryRows = req.app.locals.db.database.prepare("SELECT data FROM workspace_items WHERE email = ? AND type = 'memory' ORDER BY updated_at DESC LIMIT 20").all(String(userEmail).trim().toLowerCase());
    const memories = memoryRows.map((row) => JSON.parse(row.data).name).filter(Boolean);
    const systemPrompt = `You are the helpful AI assistant inside AllModelAI. Be clear, accurate, and concise.${memories.length ? ` User-controlled memory: ${memories.join('; ')}` : ''}`;
    let assistantText = '';

    try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${providerModels.gemini}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey.trim())}`;
        const cloudflareUrl = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(process.env.CLOUDFLARE_ACCOUNT_ID || '')}/ai/run/${providerModels.cloudflare}`;
        const apiResponse = await fetch(isClaude ? 'https://api.anthropic.com/v1/messages' : isGemini ? geminiUrl : isCloudflare ? cloudflareUrl : 'https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: isClaude ? {
                'x-api-key': apiKey.trim(),
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json',
            } : isGemini ? {
                'Content-Type': 'application/json',
            } : isCloudflare ? {
                messages: [{ role: 'system', content: systemPrompt }, ...input],
                max_tokens: Number(process.env.MAX_TOKENS) || 2048,
            } : {
                Authorization: `Bearer ${apiKey.trim()}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(isClaude ? {
                model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
                stream: true,
                max_tokens: Number(process.env.MAX_TOKENS) || 2048,
                system: systemPrompt,
                messages: input,
            } : isGemini ? {
                systemInstruction: { parts: [{ text: systemPrompt }] },
                contents: input.map(({ role, content }) => ({ role: role === 'assistant' ? 'model' : 'user', parts: [{ text: content }] })),
                generationConfig: { maxOutputTokens: Number(process.env.MAX_TOKENS) || 2048 },
            } : {
                model: routedModel === 'grok' ? grokModel : (process.env.OPENROUTER_MODEL || providerModels[routedModel]),
                stream: true,
                max_tokens: Number(process.env.MAX_TOKENS) || 2048,
                messages: [{ role: 'system', content: systemPrompt }, ...input],
            }),
        });
        if (!apiResponse.ok) {
            const data = await apiResponse.json();
            console.error(`[${isClaude ? 'CLAUDE' : isGemini ? 'GEMINI' : isCloudflare ? 'CLOUDFLARE' : 'OPENROUTER'} API]`, apiResponse.status, data.error?.message || data.errors?.[0]?.message || data.error);
            return res.status(apiResponse.status === 401 ? 502 : apiResponse.status).json({
                message: apiResponse.status === 401
                    ? `The server API key was rejected by ${isClaude ? 'Anthropic' : isGemini ? 'Google Gemini' : isCloudflare ? 'Cloudflare' : 'OpenRouter'}`
                    : (data.error?.message || data.errors?.[0]?.message || 'The AI service could not answer'),
            });
        }

        res.status(200);
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();
        res.write(`data: ${JSON.stringify({ unlimited: true, plan: creditStatus.plan })}\n\n`);

        if (isCloudflare) {
            const cloudflareData = await apiResponse.json();
            assistantText = String(cloudflareData.result?.response || '');
            if (!assistantText) throw new Error('Cloudflare returned no response text');
            res.write(`data: ${JSON.stringify({ text: assistantText, provider: 'Cloudflare', model: providerModels.cloudflare })}\n\n`);
        }

        const reader = isCloudflare ? null : apiResponse.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (reader) {
            const { done, value } = await reader.read();
            buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
            const events = buffer.replaceAll('\r\n', '\n').split('\n\n');
            buffer = events.pop() || '';

            for (const event of events) {
                const dataLine = event.split('\n').find((line) => line.startsWith('data: '));
                if (!dataLine) continue;
                const payload = dataLine.slice(6);
                if (payload === '[DONE]') continue;
                const chunk = JSON.parse(payload);
                const text = isClaude
                    ? (chunk.type === 'content_block_delta' ? chunk.delta?.text : '')
                    : isGemini
                        ? chunk.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('')
                        : chunk.choices?.[0]?.delta?.content;
                if (text) {
                    assistantText += text;
                    res.write(`data: ${JSON.stringify({ text })}\n\n`);
                }
            }

            if (done) break;
        }

        if (temporary) {
            res.write('data: [DONE]\n\n');
            return res.end();
        }

        creditStatus.data.usage[creditStatus.email] = creditStatus.used + 1;
        req.app.locals.db.write(creditStatus.data);

        const data = req.app.locals.db.read();
        data.conversations ||= [];
        const now = new Date().toISOString();
        const normalizedEmail = String(userEmail).trim().toLowerCase();
        const savedMessages = normalizeMessages([...messages, { role: 'assistant', content: assistantText }]);
        const conversation = conversationId
            ? data.conversations.find((item) => item.id === conversationId && item.email === normalizedEmail)
            : null;
        if (conversation) {
            conversation.messages = savedMessages;
            conversation.updatedAt = now;
        } else {
            data.conversations.push({
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                email: normalizedEmail,
                model,
                title: createConversationTitle(savedMessages),
                messages: savedMessages,
                createdAt: now,
                updatedAt: now,
            });
        }
        req.app.locals.db.write(data);

        res.write('data: [DONE]\n\n');
        return res.end();
    } catch (error) {
        console.error('[OPENROUTER CONNECTION]', error.message);
        return res.status(502).json({ message: 'Could not connect to the AI service' });
    }
};

const generateImage = async (req, res) => {
    const prompt = String(req.body.prompt || '').trim().slice(0, 4000);
    const imageApiKey = process.env.IMAGE_API_KEY || process.env.OPENAI_API_KEY;
    if (!imageApiKey) {
        return res.status(503).json({ message: 'Image generation is not configured. Add IMAGE_API_KEY to the backend .env file.' });
    }
    if (!prompt) return res.status(400).json({ message: 'An image prompt is required' });

    try {
        const response = await fetch(process.env.IMAGE_API_URL || 'https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${imageApiKey.trim()}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: process.env.IMAGE_MODEL || 'gpt-image-1',
                prompt,
                size: process.env.IMAGE_SIZE || '1024x1024',
                n: 1,
            }),
        });
        const data = await response.json();
        if (!response.ok) return res.status(response.status === 401 ? 502 : response.status).json({ message: data.error?.message || 'The image service could not create an image' });

        const image = data.data?.[0];
        const imageUrl = image?.url || (image?.b64_json ? `data:image/png;base64,${image.b64_json}` : null);
        if (!imageUrl) return res.status(502).json({ message: 'The image service returned no image' });
        return res.status(200).json({ imageUrl, prompt });
    } catch (error) {
        console.error('[IMAGE API]', error.message);
        return res.status(502).json({ message: 'Could not connect to the image service' });
    }
};

const workspaceTypes = new Set(['memory', 'project', 'document', 'prompt']);
const cleanEmail = (value) => String(value || '').trim().toLowerCase();
const parseWorkspaceItem = (row) => ({ id: row.id, type: row.type, ...JSON.parse(row.data), createdAt: row.created_at, updatedAt: row.updated_at });

const getWorkspaceItems = (req, res) => {
    const email = cleanEmail(req.query.email);
    const type = String(req.query.type || '');
    if (!email || !workspaceTypes.has(type)) return res.status(400).json({ message: 'Valid email and type are required' });
    const rows = req.app.locals.db.database.prepare('SELECT * FROM workspace_items WHERE email = ? AND type = ? ORDER BY updated_at DESC').all(email, type);
    return res.json(rows.map(parseWorkspaceItem));
};

const createWorkspaceItem = (req, res) => {
    const email = cleanEmail(req.body.email);
    const type = String(req.body.type || '');
    if (!email || !workspaceTypes.has(type)) return res.status(400).json({ message: 'Valid email and type are required' });
    const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const data = { ...req.body }; delete data.email; delete data.type; delete data.id;
    req.app.locals.db.database.prepare('INSERT INTO workspace_items (id, email, type, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, email, type, JSON.stringify(data), now, now);
    return res.status(201).json({ id, type, ...data, createdAt: now, updatedAt: now });
};

const updateWorkspaceItem = (req, res) => {
    const email = cleanEmail(req.body.email);
    const row = req.app.locals.db.database.prepare('SELECT * FROM workspace_items WHERE id = ? AND email = ?').get(req.params.id, email);
    if (!row) return res.status(404).json({ message: 'Workspace item not found' });
    const current = JSON.parse(row.data); const patch = { ...req.body }; delete patch.email; delete patch.id; delete patch.type;
    const data = { ...current, ...patch }; const now = new Date().toISOString();
    req.app.locals.db.database.prepare('UPDATE workspace_items SET data = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(data), now, row.id);
    return res.json({ id: row.id, type: row.type, ...data, createdAt: row.created_at, updatedAt: now });
};

const deleteWorkspaceItem = (req, res) => {
    const result = req.app.locals.db.database.prepare('DELETE FROM workspace_items WHERE id = ? AND email = ?').run(req.params.id, cleanEmail(req.body.email));
    return result.changes ? res.json({ message: 'Deleted' }) : res.status(404).json({ message: 'Workspace item not found' });
};

const getUsageAnalytics = (req, res) => {
    const email = cleanEmail(req.query.email);
    if (!email) return res.status(400).json({ message: 'Email is required' });
    const conversations = req.app.locals.db.database.prepare('SELECT model, messages, created_at AS createdAt FROM conversations WHERE email = ?').all(email);
    const byModel = {}; let messages = 0; let characters = 0;
    conversations.forEach((conversation) => { const list = JSON.parse(conversation.messages || '[]'); byModel[conversation.model || 'gpt'] = (byModel[conversation.model || 'gpt'] || 0) + 1; messages += list.length; characters += list.reduce((sum, item) => sum + String(item.content || item.text || '').length, 0); });
    return res.json({ conversations: conversations.length, messages, estimatedTokens: Math.ceil(characters / 4), byModel });
};

const branchConversation = (req, res) => {
    const email = cleanEmail(req.body.email); const source = req.app.locals.db.database.prepare('SELECT * FROM conversations WHERE id = ? AND email = ?').get(req.params.id, email);
    if (!source) return res.status(404).json({ message: 'Conversation not found' });
    const messages = JSON.parse(source.messages || '[]').slice(0, Math.max(1, Number(req.body.messageCount) || 1)); const id = `branch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; const now = new Date().toISOString();
    req.app.locals.db.database.prepare('INSERT INTO conversations (id, email, model, title, messages, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, email, req.body.model || source.model, `${source.title} (branch)`, JSON.stringify(messages), now, now);
    return res.status(201).json({ id, email, model: req.body.model || source.model, title: `${source.title} (branch)`, messages, createdAt: now, updatedAt: now });
};

module.exports = {
    registerUser,
    loginUser,
    getSocialAccounts,
    socialLogin,
    startGoogleAuth,
    googleCallback,
    getSession,
    logout,
    getUsers,
    getUserById,
    createUser,
    updateUser,
    patchUser,
    deleteUser,
    deleteAccount,
    getCredits,
        getModelStatus,
        getAdminStats,
    getChatHistory,
    createChatHistory,
    renameChat,
    deleteChat,
    createPurchase,
    createChatResponse,
    generateImage,
    getWorkspaceItems,
    createWorkspaceItem,
    updateWorkspaceItem,
    deleteWorkspaceItem,
    getUsageAnalytics,
    branchConversation,
};
