const crypto = require('node:crypto');
const { promisify } = require('node:util');
const Stripe = require('stripe');
const users = require('../data/data');

const sessionCookie = 'allmodelai_session';
const sessionDuration = 1000 * 60 * 60 * 24 * 30;
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const scrypt = promisify(crypto.scrypt);
const publicUser = ({ passwordHash, ...user }) => user;
const hashPassword = async (password) => {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = await scrypt(password, salt, 64);
    return `${salt}:${Buffer.from(derivedKey).toString('hex')}`;
};
const verifyPassword = async (password, passwordHash) => {
    if (!passwordHash || !passwordHash.includes(':')) return false;
    const [salt, storedKey] = passwordHash.split(':');
    const derivedKey = Buffer.from(await scrypt(password, salt, 64));
    const storedBuffer = Buffer.from(storedKey, 'hex');
    return storedBuffer.length === derivedKey.length && crypto.timingSafeEqual(storedBuffer, derivedKey);
};
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
})[character]);
const sendWelcomeEmail = async (user) => {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim();
    if (!apiKey || !from) return { sent: false, reason: 'not_configured' };

    const safeName = escapeHtml(user.name);
    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': `welcome-${user.id}-${crypto.createHash('sha256').update(user.email).digest('hex').slice(0, 24)}`,
        },
        body: JSON.stringify({
            from,
            to: [user.email],
            subject: 'Welcome to AllModelAI',
            text: `Hello, ${user.name}! Your AllModelAI account has been created successfully. You can now sign in and use your AI workspace.`,
            html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:32px;background:#111827;color:#e5e7eb;border-radius:16px"><div style="display:inline-block;padding:8px 12px;background:#6d5dfc;border-radius:10px;font-weight:700">AI</div><h1 style="color:#fff">Welcome to AllModelAI, ${safeName}!</h1><p>Your account has been created successfully.</p><p>You can now sign in, choose an AI model and start working in your workspace.</p><p style="color:#94a3b8;font-size:13px">If you did not create this account, you can ignore this email.</p></div>`,
        }),
    });
    if (!response.ok) {
        const details = await response.json().catch(() => ({}));
        throw new Error(details.message || details.error?.message || `Email provider returned ${response.status}`);
    }
    const result = await response.json();
    return { sent: true, id: result.id };
};
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

const registerUser = async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ message: 'Name, email and password are required' });
    }

    if (typeof password !== 'string') return res.status(400).json({ message: 'Password must be text' });

    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return res.status(400).json({ message: 'Enter a valid email address' });
    }
    const existingUser = users.find((user) => user.email.toLowerCase() === normalizedEmail);
    if (existingUser?.passwordHash) {
        return res.status(409).json({ message: 'An account with this email already exists' });
    }

    if (existingUser) {
        existingUser.name = name.trim() || existingUser.name;
        existingUser.passwordHash = await hashPassword(password);
        saveUsers(req.app.locals.db);
        setSession(req, res, existingUser, req.body.rememberMe === true || req.body.rememberMe === 'true');
        return res.status(200).json({
            message: 'Password added to your existing account',
            user: publicUser(existingUser),
            welcomeEmail: { sent: false, reason: 'existing_account' },
        });
    }

    const newUser = {
        id: users.length ? Math.max(...users.map((user) => user.id)) + 1 : 1,
        name: name.trim(),
        email: normalizedEmail,
        passwordHash: await hashPassword(password),
    };

    users.push(newUser);
    saveUsers(req.app.locals.db);
    setSession(req, res, newUser, req.body.rememberMe === true || req.body.rememberMe === 'true');
    let welcomeEmail = { sent: false, reason: 'not_configured' };
    try {
        welcomeEmail = await sendWelcomeEmail(newUser);
    } catch (error) {
        console.error('[WELCOME EMAIL]', error.message);
        welcomeEmail = { sent: false, reason: 'delivery_failed' };
    }
    return res.status(201).json({
        message: 'Account created successfully',
        user: publicUser(newUser),
        welcomeEmail,
    });
};

const loginUser = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = users.find(
        (item) => item.email.toLowerCase() === email.trim().toLowerCase()
    );
    const remoteAddress = req.socket.remoteAddress;
    const isLocalRequest = remoteAddress === '127.0.0.1'
        || remoteAddress === '::1'
        || remoteAddress === '::ffff:127.0.0.1';
    const allowAnyPassword = process.env.ALLOW_ANY_PASSWORD === 'true' && isLocalRequest;

    if (user && !user.passwordHash) {
        user.passwordHash = await hashPassword(password);
        saveUsers(req.app.locals.db);
        setSession(req, res, user, req.body.rememberMe === true || req.body.rememberMe === 'true');
        return res.status(200).json({
            message: 'Password created and signed in successfully',
            passwordCreated: true,
            user: publicUser(user),
        });
    }
    if (!user || (!allowAnyPassword && !(await verifyPassword(password, user.passwordHash)))) {
        return res.status(401).json({ message: 'Incorrect email or password' });
    }

    setSession(req, res, user, req.body.rememberMe === true || req.body.rememberMe === 'true');

    return res.status(200).json({
        message: 'Signed in successfully',
        user: publicUser(user),
    });
};

const providerNames = { google: 'Google', apple: 'Apple', facebook: 'Facebook' };

const getSocialAccounts = (req, res) => {
    if (process.env.ENABLE_DEMO_SOCIAL_AUTH !== 'true') return res.status(404).json({ message: 'Demo social accounts are disabled. Use Google OAuth.' });
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
    if (process.env.ENABLE_DEMO_SOCIAL_AUTH !== 'true') return res.status(404).json({ message: 'Demo social sign-in is disabled. Use Google OAuth.' });
    const provider = String(req.body.provider || '').toLowerCase();
    const accountId = String(req.body.accountId || '');
    if (!providerNames[provider] || !accountId.startsWith(`${provider}-`)) return res.status(400).json({ message: 'A valid provider account is required' });
    const sourceUser = users.find((user) => user.id === Number(accountId.slice(provider.length + 1)));
    if (!sourceUser) return res.status(404).json({ message: 'Provider account was not found' });
    const user = { ...publicUser(sourceUser), provider: providerNames[provider] };
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
    res.status(200).json(users.map(publicUser));
};

const getCommunityUsers = (_req, res) => {
    const communityUsers = users
        .filter((user) => user.id >= 1 && user.id <= 8)
        .map(({ id, name, email }) => ({ id, name, email }));

    return res.status(200).json(communityUsers);
};

const getUserById = (req, res) => {
    const id = Number(req.params.id);
    const user = users.find((item) => item.id === id);

    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json(publicUser(user));
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
    const email = req.user.email;

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

const subscriptionPlans = {
    free: { name: 'Developer', amount: 0, interval: 'month', limit: 5000, models: ['all'] },
    week: { name: 'Weekly', amount: 599, interval: 'week', limit: 500, models: ['smart', 'gemini', 'gpt', 'llama', 'deepseek', 'cloudflare'] },
    common: { name: 'Pro Monthly', amount: 1900, interval: 'month', limit: 3000, models: ['smart', 'gemini', 'gpt', 'claude', 'llama', 'grok', 'copilot', 'perplexity', 'kimi', 'deepseek', 'mistral', 'qwen', 'cohere', 'cloudflare'] },
    plus: { name: 'Power Monthly', amount: 4900, interval: 'month', limit: 12000, models: ['all'] },
};
const creditLimits = Object.fromEntries(Object.entries(subscriptionPlans).map(([key, plan]) => [key, plan.limit]));
const creditLimitsEnabled = () => process.env.ENFORCE_CREDIT_LIMITS === 'true';
const developerEmails = () => new Set(String(process.env.DEVELOPER_EMAILS || 'hrybovnikita@gmail.com').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean));

const getCreditStatus = (database, email) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const data = database.read();
    data.subscriptions ||= {};
    data.usage ||= {};
    const detail = database.database.prepare('SELECT plan, billing_interval AS billingInterval, request_limit AS requestLimit, period_end AS periodEnd, status FROM subscription_details WHERE email = ?').get(normalizedEmail);
    const detailActive = detail && detail.status === 'active' && (!detail.periodEnd || Date.parse(detail.periodEnd) > Date.now());
    const plan = detailActive ? detail.plan : (data.subscriptions[normalizedEmail] || 'free');
    const planDefinition = subscriptionPlans[plan] || subscriptionPlans.free;
    const limit = detailActive ? detail.requestLimit : (creditLimits[plan] || creditLimits.free);
    const used = Number(data.usage[normalizedEmail] || 0);

    return { data, email: normalizedEmail, plan, limit, used, remaining: Math.max(limit - used, 0), billingInterval: detail?.billingInterval || planDefinition.interval, periodEnd: detailActive ? detail.periodEnd : null, models: planDefinition.models, enforced: creditLimitsEnabled() || Boolean(detailActive) };
};

const getModelStatus = (_req, res) => {
    const gateway = Boolean(process.env.OPENROUTER_API_KEY || process.env.API_KEY);
    const openAI = Boolean(process.env.OPENAI_API_KEY || process.env.OPEN_AI_API_KEY);
    return res.status(200).json({
        updatedAt: new Date().toISOString(),
        models: {
            gpt: openAI || gateway,
            gemini: Boolean(process.env.GEMINI_API_KEY || gateway),
            claude: Boolean(process.env.CLAUDE_API_KEY || gateway),
            cloudflare: Boolean(((process.env.CLOUDFLARE_API_KEY || process.env.CLAUDEFLARE_API_KEY) && process.env.CLOUDFLARE_ACCOUNT_ID) || gateway),
            others: gateway,
        },
    });
};

const getAdminStats = (req, res) => {
    if (!process.env.ADMIN_KEY) return res.status(503).json({ message: 'Admin access is not configured' });
    if (req.get('x-admin-key') !== process.env.ADMIN_KEY) return res.status(401).json({ message: 'Invalid admin key' });
    const data = req.app.locals.db.read();
    return res.status(200).json({ users: data.users.length, conversations: data.conversations.length, purchases: data.purchases.length, activeSessions: req.app.locals.db.database.prepare('SELECT COUNT(*) AS count FROM auth_sessions WHERE expires_at > ?').get(Date.now()).count });
};

const getCredits = (req, res) => {
    const status = getCreditStatus(req.app.locals.db, req.user.email);
    const unlimited = !status.enforced;
    return res.status(200).json({ plan: status.plan, limit: status.limit, used: status.used, remaining: status.remaining, unlimited, billingInterval: status.billingInterval, periodEnd: status.periodEnd, models: status.models });
};

const getChatHistory = (req, res) => {
    const email = req.user.email;

    const data = req.app.locals.db.read();
    const conversations = (data.conversations || [])
        .filter((conversation) => conversation.email === email)
        .map(getConversationPayload)
        .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
    return res.status(200).json(conversations);
};

const createChatHistory = (req, res) => {
    const email = req.user.email;
    const model = String(req.body.model || 'gpt');
    const messages = normalizeMessages(req.body.messages);

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
    const email = req.user.email;
    const title = req.body.title === undefined ? undefined : String(req.body.title).trim().slice(0, 60);
    const messages = Array.isArray(req.body.messages) ? normalizeMessages(req.body.messages) : undefined;
    if (!title && !messages) return res.status(400).json({ message: 'Title or messages are required' });

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
    const email = req.user.email;

    const data = req.app.locals.db.read();
    const index = (data.conversations || []).findIndex((item) => item.id === req.params.id && item.email === email);
    if (index === -1) return res.status(404).json({ message: 'Conversation not found' });

    data.conversations.splice(index, 1);
    req.app.locals.db.write(data);
    return res.status(200).json({ message: 'Conversation deleted successfully' });
};

const normalizePlanKey = (value) => ({ starter: 'free', developer: 'free', pro: 'common', monthly: 'common', power: 'plus' }[String(value || '').toLowerCase()] || String(value || '').toLowerCase());
const periodEndFor = (interval) => new Date(Date.now() + (interval === 'week' ? 7 : 30) * 24 * 60 * 60 * 1000).toISOString();

const activateSubscription = (database, { email, name = 'Subscriber', city = '', dateOfBirth = '', planKey, stripeCustomerId = null, stripeSubscriptionId = null }) => {
    const plan = subscriptionPlans[planKey];
    if (!plan) throw new Error('Unknown subscription plan');
    const normalizedEmail = String(email).trim().toLowerCase();
    const data = database.read();
    data.subscriptions ||= {};
    data.usage ||= {};
    const purchase = {
        id: data.purchases.length ? Math.max(...data.purchases.map((item) => item.id)) + 1 : 1,
        plan: planKey,
        name: String(name).trim(),
        email: normalizedEmail,
        city: String(city).trim(),
        dateOfBirth: String(dateOfBirth),
        createdAt: new Date().toISOString(),
    };
    data.purchases.push(purchase);
    data.subscriptions[normalizedEmail] = planKey;
    data.usage[normalizedEmail] = 0;
    database.write(data);
    database.database.prepare(`INSERT INTO subscription_details (email, plan, billing_interval, request_limit, period_end, stripe_customer_id, stripe_subscription_id, status, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?) ON CONFLICT(email) DO UPDATE SET plan=excluded.plan, billing_interval=excluded.billing_interval, request_limit=excluded.request_limit, period_end=excluded.period_end, stripe_customer_id=excluded.stripe_customer_id, stripe_subscription_id=excluded.stripe_subscription_id, status='active', updated_at=excluded.updated_at`)
        .run(normalizedEmail, planKey, plan.interval, plan.limit, periodEndFor(plan.interval), stripeCustomerId, stripeSubscriptionId, new Date().toISOString());
    return purchase;
};

const createCheckoutSession = async (req, res) => {
    const planKey = normalizePlanKey(req.body.plan);
    const plan = subscriptionPlans[planKey];
    if (!plan) return res.status(400).json({ message: 'Choose a valid subscription plan' });
    const email = String(req.user.email).trim().toLowerCase();
    if (developerEmails().has(email)) {
        const purchase = activateSubscription(req.app.locals.db, { email, name: req.user.name, planKey: 'free' });
        return res.status(201).json({ developerAccess: true, purchase, redirectUrl: `${process.env.FRONTEND_ORIGIN || 'http://localhost:5173'}/checkout?success=developer&plan=developer` });
    }
    if (plan.amount === 0) return res.status(403).json({ message: 'The Developer plan is available only to configured developer accounts.' });
    if (!process.env.STRIPE_SECRET_KEY?.trim()) return res.status(503).json({ message: 'Payments are not configured. Add STRIPE_SECRET_KEY to the backend environment.' });
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY.trim());
    const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
    const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer_email: email,
        client_reference_id: String(req.user.id),
        billing_address_collection: 'required',
        phone_number_collection: { enabled: true },
        line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: plan.amount, recurring: { interval: plan.interval }, product_data: { name: `AllModelAI ${plan.name}`, description: `${plan.limit.toLocaleString()} AI requests per ${plan.interval}` } } }],
        metadata: { email, plan: planKey, userName: req.user.name || 'Subscriber' },
        subscription_data: { metadata: { email, plan: planKey } },
        success_url: `${frontendOrigin}/checkout?success=1&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${frontendOrigin}/checkout?canceled=1&plan=${planKey}`,
    });
    return res.status(201).json({ checkoutUrl: session.url });
};

const fulfillStripeSession = (database, session) => {
    const planKey = normalizePlanKey(session.metadata?.plan);
    if (!subscriptionPlans[planKey] || (session.payment_status !== 'paid' && session.status !== 'complete')) throw new Error('Payment is not complete');
    const existing = session.subscription && database.database.prepare('SELECT email FROM subscription_details WHERE stripe_subscription_id = ? AND status = ?').get(String(session.subscription), 'active');
    if (existing) {
        const previous = database.read().purchases.filter((item) => item.email === existing.email && item.plan === planKey).at(-1);
        return previous || { email: existing.email, plan: planKey, name: session.metadata.userName || 'Subscriber' };
    }
    return activateSubscription(database, { email: session.metadata.email || session.customer_details?.email, name: session.metadata.userName, planKey, stripeCustomerId: session.customer, stripeSubscriptionId: session.subscription });
};

const verifyCheckoutSession = async (req, res) => {
    if (!process.env.STRIPE_SECRET_KEY?.trim()) return res.status(503).json({ message: 'Payments are not configured' });
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY.trim());
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    if (String(session.metadata?.email).toLowerCase() !== String(req.user.email).toLowerCase()) return res.status(403).json({ message: 'This checkout belongs to another account' });
    const purchase = fulfillStripeSession(req.app.locals.db, session);
    return res.json({ purchase, plan: subscriptionPlans[purchase.plan] });
};

const stripeWebhook = (req, res) => {
    if (!process.env.STRIPE_SECRET_KEY?.trim() || !process.env.STRIPE_WEBHOOK_SECRET?.trim()) return res.status(503).send('Stripe webhook is not configured');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY.trim());
    let event;
    try { event = stripe.webhooks.constructEvent(req.body, req.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET.trim()); }
    catch (error) { return res.status(400).send(`Webhook Error: ${error.message}`); }
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
        try { fulfillStripeSession(req.app.locals.db, event.data.object); } catch (error) { return res.status(400).send(error.message); }
    }
    if (event.type === 'customer.subscription.deleted') {
        req.app.locals.db.database.prepare("UPDATE subscription_details SET status = 'canceled', updated_at = ? WHERE stripe_subscription_id = ?").run(new Date().toISOString(), String(event.data.object.id));
    }
    return res.json({ received: true });
};

const createPurchase = (req, res) => createCheckoutSession(req, res);

const chooseSmartRoute = (prompt, mode = 'balanced') => {
    const text = String(prompt || '').toLowerCase();
    const signals = {
        coding: /code|debug|function|react|javascript|typescript|python|api|sql|ошибк|код|функц/.test(text),
        research: /research|latest|source|news|find|citation|исслед|источник|новост|найди/.test(text),
        writing: /write|rewrite|essay|story|email|текст|перепиш|стать|письм/.test(text),
        multilingual: /translate|translation|перевод|переведи|україн|украин/.test(text),
        longContext: text.length > 3500 || /document|report|pdf|документ|отч[её]т/.test(text),
    };
    if (mode === 'economy') return { model: process.env.CLOUDFLARE_ACCOUNT_ID ? 'cloudflare' : 'gemini', reason: 'Economy mode selected the lowest-cost available model.', category: 'economy' };
    if (mode === 'speed') return { model: 'gemini', reason: 'Speed mode selected Gemini for low-latency generation.', category: 'speed' };
    if (signals.research) return { model: 'perplexity', reason: 'Research intent and source-related terms were detected.', category: 'research' };
    if (signals.coding) return { model: mode === 'quality' ? 'deepseek' : 'deepseek', reason: 'Code or debugging signals were detected.', category: 'coding' };
    if (signals.longContext || signals.writing) return { model: 'claude', reason: signals.longContext ? 'A long document or large context was detected.' : 'Long-form writing intent was detected.', category: signals.longContext ? 'documents' : 'writing' };
    if (signals.multilingual) return { model: 'gemini', reason: 'A multilingual or translation task was detected.', category: 'multilingual' };
    if (mode === 'quality') return { model: 'claude', reason: 'Quality mode selected a strong reasoning model.', category: 'reasoning' };
    return { model: 'gpt', reason: 'Balanced routing selected a versatile general model.', category: 'general' };
};

const previewRouter = (req, res) => {
    const prompt = String(req.body.prompt || '').trim();
    if (!prompt) return res.status(400).json({ message: 'Prompt is required' });
    return res.json(chooseSmartRoute(prompt, req.body.routerMode));
};

const createChatResponse = async (req, res) => {
    const { messages, model = 'gpt', conversationId, temporary = false, routerMode = 'balanced', responsePrefs = {}, useKnowledge = true, systemInstructions = '', maxTokens } = req.body;
    const userEmail = req.user.email;
    const providerModels = {
        gpt: 'openai/gpt-4o-mini',
        claude: 'anthropic/claude-haiku-4.5',
        gemini: 'google/gemini-2.5-flash',
        grok: '~x-ai/grok-latest',
        copilot: 'openai/gpt-4o-mini',
        perplexity: 'perplexity/sonar',
        kimi: process.env.KIMI_MODEL || 'moonshotai/kimi-k2.5',
        deepseek: 'deepseek/deepseek-chat',
        llama: 'meta-llama/llama-3.3-70b-instruct',
        mistral: 'mistralai/mistral-small-3.1-24b-instruct',
        qwen: 'qwen/qwen-2.5-72b-instruct',
        cohere: 'cohere/command-a',
        cloudflare: process.env.CLOUDFLARE_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    };
    const configuredGrokModel = process.env.GROK_MODEL?.trim();
    const grokModel = configuredGrokModel && !/grok-3-mini/i.test(configuredGrokModel)
        ? configuredGrokModel
        : providerModels.grok;
    const latestPrompt = String(messages?.at(-1)?.text || messages?.at(-1)?.content || '');
    const routeDecision = chooseSmartRoute(latestPrompt, routerMode);
    const routedModel = model === 'smart' ? routeDecision.model : model;

    // Prefer the shared OpenRouter connection for Claude when it is configured.
    // This keeps Claude available when a direct Anthropic account has no credits.
    const gatewayKey = process.env.OPENROUTER_API_KEY || process.env.API_KEY;
    const openAIKey = (process.env.OPENAI_API_KEY || process.env.OPEN_AI_API_KEY)?.trim();
    const preferGemini = process.env.PREFER_GEMINI === 'true' && Boolean(process.env.GEMINI_API_KEY?.trim());
    const usePreferredGemini = preferGemini && model === 'smart' && (routedModel === 'gpt' || routedModel === 'copilot');
    let isOpenAI = Boolean(openAIKey && !usePreferredGemini && (routedModel === 'gpt' || routedModel === 'copilot'));
    const isClaude = routedModel === 'claude' && !gatewayKey?.trim();
    let isGemini = (routedModel === 'gemini' || usePreferredGemini) && Boolean(process.env.GEMINI_API_KEY?.trim());
    const hasCloudflareDirect = Boolean((process.env.CLOUDFLARE_API_KEY || process.env.CLAUDEFLARE_API_KEY) && process.env.CLOUDFLARE_ACCOUNT_ID);
    const isCloudflare = routedModel === 'cloudflare' && hasCloudflareDirect;
    const cloudflareKey = process.env.CLOUDFLARE_API_KEY || process.env.CLAUDEFLARE_API_KEY;
    let apiKey = isOpenAI ? openAIKey : isClaude ? process.env.CLAUDE_API_KEY : isGemini ? process.env.GEMINI_API_KEY : isCloudflare ? cloudflareKey : gatewayKey;
    if (!apiKey) {
        return res.status(503).json({ message: `${isClaude ? 'The Claude' : isGemini ? 'The Gemini' : isCloudflare ? 'The Cloudflare' : 'The OpenRouter'} API key is not configured` });
    }
    if (!providerModels[routedModel]) {
        return res.status(400).json({ message: 'Unsupported AI model' });
    }
    if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ message: 'At least one message is required' });
    }

    const creditStatus = getCreditStatus(req.app.locals.db, userEmail);
    if (creditStatus.enforced && creditStatus.used >= creditStatus.limit) {
        return res.status(429).json({ message: `Your ${creditStatus.plan} plan has reached its request limit. Choose a larger plan to continue.` });
    }
    if (creditStatus.enforced && !creditStatus.models.includes('all') && !creditStatus.models.includes(model) && model !== 'smart') {
        return res.status(403).json({ message: `${model} is not included in your current plan. Upgrade your model access to use it.` });
    }

    const input = normalizeMessages(messages).map(({ role, content }) => ({
        role: role === 'assistant' ? 'assistant' : 'user',
        content: content.slice(0, 8000),
    }));
    const memoryRows = req.app.locals.db.database.prepare("SELECT data FROM workspace_items WHERE email = ? AND type = 'memory' ORDER BY updated_at DESC LIMIT 20").all(String(userEmail).trim().toLowerCase());
    const memories = memoryRows.map((row) => JSON.parse(row.data).name).filter(Boolean);
    const knowledge = useKnowledge ? findKnowledge(req.app.locals.db.database, userEmail, latestPrompt, 4) : [];
    const safePreference = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
    const preferences = {
        length: safePreference(responsePrefs.length, ['short', 'balanced', 'detailed'], 'balanced'),
        tone: safePreference(responsePrefs.tone, ['simple', 'clear', 'professional'], 'clear'),
        creativity: safePreference(responsePrefs.creativity, ['precise', 'balanced', 'creative'], 'balanced'),
        format: safePreference(responsePrefs.format, ['auto', 'list', 'table', 'json'], 'auto'),
    };
    const knowledgeContext = knowledge.length ? `\nKnowledge base excerpts (cite them as [KB1], [KB2]):\n${knowledge.map((item, index) => `[KB${index + 1}] ${item.name}: ${item.excerpt}`).join('\n')}` : '';
    const customInstructions = String(systemInstructions || '').trim().slice(0, 2000);
    const systemPrompt = `You are the helpful AI assistant inside AllModelAI. Be clear and accurate. Always detect the language of the user's latest message and answer in that same language. If the message mixes languages, use the dominant language. Keep code, product names, and quoted text unchanged. Put all source code in complete fenced Markdown code blocks with the correct language tag so it can be copied directly into an IDE. Response preferences: length=${preferences.length}, tone=${preferences.tone}, creativity=${preferences.creativity}, format=${preferences.format}.${customInstructions ? ` User instructions: ${customInstructions}` : ''}${memories.length ? ` User-controlled memory: ${memories.join('; ')}` : ''}${knowledgeContext}`;
    let assistantText = '';
    const outputTokenLimit = Math.min(Math.max(Number(maxTokens) || Number(process.env.MAX_TOKENS) || 1024, 128), 4096);

    try {
        const directGeminiModel = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
        const getGeminiUrl = (key) => `https://generativelanguage.googleapis.com/v1beta/models/${directGeminiModel}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key.trim())}`;
        const geminiBody = () => JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: input.map(({ role, content }) => ({ role: role === 'assistant' ? 'model' : 'user', parts: [{ text: content }] })),
            generationConfig: { maxOutputTokens: outputTokenLimit },
        });
        const geminiUrl = getGeminiUrl(apiKey);
        const cloudflareUrl = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(process.env.CLOUDFLARE_ACCOUNT_ID || '')}/ai/run/${providerModels.cloudflare}`;
        let apiResponse = await fetch(isOpenAI ? 'https://api.openai.com/v1/responses' : isClaude ? 'https://api.anthropic.com/v1/messages' : isGemini ? geminiUrl : isCloudflare ? cloudflareUrl : 'https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: isOpenAI ? {
                Authorization: `Bearer ${apiKey.trim()}`,
                'Content-Type': 'application/json',
            } : isClaude ? {
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
            body: JSON.stringify(isOpenAI ? {
                model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                instructions: systemPrompt,
                input,
                max_output_tokens: outputTokenLimit,
                store: false,
            } : isClaude ? {
                model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
                stream: true,
                max_tokens: outputTokenLimit,
                system: systemPrompt,
                messages: input,
            } : isGemini ? JSON.parse(geminiBody()) : {
                model: routedModel === 'grok' ? grokModel : routedModel === 'cloudflare' ? providerModels.llama : providerModels[routedModel],
                stream: true,
                max_tokens: outputTokenLimit,
                messages: [{ role: 'system', content: systemPrompt }, ...input],
            }),
        });
        let fallbackUsed = usePreferredGemini;
        let fallbackModel = usePreferredGemini ? 'gemini' : null;
        let upstreamError = null;
        if (!apiResponse.ok && isOpenAI && [402, 429].includes(apiResponse.status) && process.env.GEMINI_API_KEY?.trim()) {
            upstreamError = await apiResponse.json().catch(() => ({}));
            apiKey = process.env.GEMINI_API_KEY.trim();
            isOpenAI = false;
            isGemini = true;
            apiResponse = await fetch(getGeminiUrl(apiKey), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: geminiBody(),
            });
            fallbackUsed = apiResponse.ok;
            fallbackModel = 'gemini';
            if (!apiResponse.ok) upstreamError = null;
        }
        if (!apiResponse.ok && model === 'smart' && !isOpenAI && !isClaude && !isGemini && !isCloudflare && routedModel !== 'gpt') {
            upstreamError = await apiResponse.json().catch(() => ({}));
            apiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: { Authorization: `Bearer ${apiKey.trim()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: providerModels.gpt,
                    stream: true,
                    max_tokens: outputTokenLimit,
                    messages: [{ role: 'system', content: `${systemPrompt} The requested ${routedModel} provider is temporarily unavailable; provide the best equivalent answer.` }, ...input],
                }),
            });
            fallbackUsed = apiResponse.ok;
            fallbackModel = 'gpt';
        }
        if (!apiResponse.ok) {
            const data = upstreamError || await apiResponse.json().catch(() => ({}));
            console.error(`[${isOpenAI ? 'OPENAI' : isClaude ? 'CLAUDE' : isGemini ? 'GEMINI' : isCloudflare ? 'CLOUDFLARE' : 'OPENROUTER'} API]`, apiResponse.status, data.error?.message || data.errors?.[0]?.message || data.error);
            return res.status(apiResponse.status === 401 ? 502 : apiResponse.status).json({
                message: apiResponse.status === 401
                    ? `The server API key was rejected by ${isOpenAI ? 'OpenAI' : isClaude ? 'Anthropic' : isGemini ? 'Google Gemini' : isCloudflare ? 'Cloudflare' : 'OpenRouter'}`
                    : (data.error?.message || data.errors?.[0]?.message || 'The AI service could not answer'),
            });
        }

        res.status(200);
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();
        const freeTierModels = new Set(['gemini', 'cloudflare']);
        res.write(`data: ${JSON.stringify({ unlimited: true, plan: creditStatus.plan, requestedModel:model, routedModel, actualModelId:providerModels[routedModel], routeReason:model === 'smart' ? routeDecision.reason : 'Exact model selected manually.', routeCategory:routeDecision.category, knowledgeSources:knowledge.map(({id,name})=>({id,name})), costTier:freeTierModels.has(routedModel)?'free-allowance':'paid' })}\n\n`);
        if (fallbackUsed) res.write(`data: ${JSON.stringify({ fallback: true, requestedModel: routedModel, actualModel: fallbackModel })}\n\n`);

        if (isOpenAI) {
            const openAIData = await apiResponse.json();
            assistantText = String(openAIData.output_text || openAIData.output?.flatMap((item) => item.content || []).map((item) => item.text || '').join('') || '');
            if (!assistantText) throw new Error('OpenAI returned no response text');
            res.write(`data: ${JSON.stringify({ text: assistantText, provider: 'OpenAI', model: openAIData.model || process.env.OPENAI_MODEL || 'gpt-4o-mini' })}\n\n`);
        } else if (isCloudflare) {
            const cloudflareData = await apiResponse.json();
            assistantText = String(cloudflareData.result?.response || '');
            if (!assistantText) throw new Error('Cloudflare returned no response text');
            res.write(`data: ${JSON.stringify({ text: assistantText, provider: 'Cloudflare', model: providerModels.cloudflare })}\n\n`);
        }

        const reader = isOpenAI || isCloudflare ? null : apiResponse.body.getReader();
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
    const imageApiUrl = process.env.IMAGE_API_URL || 'https://api.openai.com/v1/images/generations';
    const configuredImageKeys = [process.env.IMAGE_API_KEY, process.env.OPENAI_API_KEY, process.env.OPEN_AI_API_KEY, process.env.API_IMAGE_KEY]
        .map((value) => String(value || '').trim())
        .filter(Boolean);
    const imageApiKey = process.env.IMAGE_API_URL
        ? configuredImageKeys[0]
        : configuredImageKeys.find((value) => /^sk-(?:proj-|svcacct-)?/i.test(value));
    const cloudflareAccountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
    const cloudflareImageKey = String(process.env.CLOUDFLARE_API_KEY || process.env.CLAUDEFLARE_API_KEY || process.env.API_IMAGE_KEY || '').trim();
    const useCloudflare = process.env.IMAGE_PROVIDER === 'cloudflare' || (!imageApiKey && cloudflareAccountId && cloudflareImageKey);
    if (!imageApiKey && !useCloudflare) {
        return res.status(503).json({ message: 'Configure OpenAI Images, or set IMAGE_PROVIDER=cloudflare with CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_KEY.' });
    }
    if (!prompt) return res.status(400).json({ message: 'An image prompt is required' });

    try {
        const response = await fetch(useCloudflare
            ? `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cloudflareAccountId)}/ai/run/${process.env.CLOUDFLARE_IMAGE_MODEL || '@cf/black-forest-labs/flux-1-schnell'}`
            : imageApiUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${useCloudflare ? cloudflareImageKey : imageApiKey.trim()}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(useCloudflare ? { prompt: prompt.slice(0, 2048), steps: 4 } : {
                model: process.env.IMAGE_MODEL || 'gpt-image-1',
                prompt,
                size: process.env.IMAGE_SIZE || '1024x1024',
                n: 1,
            }),
        });
        const data = await response.json();
        if (!response.ok) {
            const safeMessage = response.status === 401
                ? 'The image API key was rejected. Check that the OpenAI key is active and has API billing enabled.'
                : String(data.error?.message || 'The image service could not create an image')
                    .replace(/(?:sk|cf)[A-Za-z0-9_*-]{8,}/gi, '[API key hidden]');
            return res.status(response.status === 401 ? 502 : response.status).json({ message: safeMessage });
        }

        const image = data.data?.[0];
        const cloudflareBase64 = data.result?.image;
        const imageUrl = cloudflareBase64 ? `data:image/jpeg;base64,${cloudflareBase64}` : image?.url || (image?.b64_json ? `data:image/png;base64,${image.b64_json}` : null);
        if (!imageUrl) return res.status(502).json({ message: 'The image service returned no image' });
        return res.status(200).json({ imageUrl, prompt });
    } catch (error) {
        console.error('[IMAGE API]', error.message);
        return res.status(502).json({ message: 'Could not connect to the image service' });
    }
};

const workspaceTypes = new Set(['memory', 'project', 'document', 'prompt', 'assistant', 'team', 'presentation', 'website']);
const cleanEmail = (value) => String(value || '').trim().toLowerCase();
const parseWorkspaceItem = (row) => ({ id: row.id, type: row.type, ...JSON.parse(row.data), createdAt: row.created_at, updatedAt: row.updated_at });

const getWorkspaceItems = (req, res) => {
    const email = req.user.email;
    const type = String(req.query.type || '');
    if (!workspaceTypes.has(type)) return res.status(400).json({ message: 'Valid type is required' });
    const rows = req.app.locals.db.database.prepare('SELECT * FROM workspace_items WHERE email = ? AND type = ? ORDER BY updated_at DESC').all(email, type);
    return res.json(rows.map(parseWorkspaceItem));
};

const createWorkspaceItem = (req, res) => {
    const email = req.user.email;
    const type = String(req.body.type || '');
    if (!workspaceTypes.has(type)) return res.status(400).json({ message: 'Valid type is required' });
    const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const data = { ...req.body }; delete data.email; delete data.type; delete data.id;
    req.app.locals.db.database.prepare('INSERT INTO workspace_items (id, email, type, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, email, type, JSON.stringify(data), now, now);
    return res.status(201).json({ id, type, ...data, createdAt: now, updatedAt: now });
};

const updateWorkspaceItem = (req, res) => {
    const email = req.user.email;
    const row = req.app.locals.db.database.prepare('SELECT * FROM workspace_items WHERE id = ? AND email = ?').get(req.params.id, email);
    if (!row) return res.status(404).json({ message: 'Workspace item not found' });
    const current = JSON.parse(row.data); const patch = { ...req.body }; delete patch.email; delete patch.id; delete patch.type;
    const data = { ...current, ...patch }; const now = new Date().toISOString();
    req.app.locals.db.database.prepare('UPDATE workspace_items SET data = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(data), now, row.id);
    return res.json({ id: row.id, type: row.type, ...data, createdAt: row.created_at, updatedAt: now });
};

const deleteWorkspaceItem = (req, res) => {
    const result = req.app.locals.db.database.prepare('DELETE FROM workspace_items WHERE id = ? AND email = ?').run(req.params.id, req.user.email);
    return result.changes ? res.json({ message: 'Deleted' }) : res.status(404).json({ message: 'Workspace item not found' });
};

const getUsageAnalytics = (req, res) => {
    const email = req.user.email;
    const conversations = req.app.locals.db.database.prepare('SELECT model, messages, created_at AS createdAt FROM conversations WHERE email = ?').all(email);
    const byModel = {}; let messages = 0; let characters = 0; let freeConversations = 0;
    const freeModels = new Set(['gemini', 'cloudflare']);
    conversations.forEach((conversation) => { const list = JSON.parse(conversation.messages || '[]'); const model=conversation.model||'gpt'; byModel[model] = (byModel[model] || 0) + 1; if(freeModels.has(model))freeConversations+=1; messages += list.length; characters += list.reduce((sum, item) => sum + String(item.content || item.text || '').length, 0); });
    const estimatedTokens = Math.ceil(characters / 4);
    const paidRatio=conversations.length?(conversations.length-freeConversations)/conversations.length:0;
    const estimatedCost=Number((estimatedTokens/1000000*2.4*paidRatio).toFixed(4));
    return res.json({ conversations: conversations.length, messages, estimatedTokens, estimatedCost, estimatedSavings:Number((estimatedTokens/1000000*2.4-estimatedCost).toFixed(4)), freeConversations, paidConversations:conversations.length-freeConversations, byModel });
};

const branchConversation = (req, res) => {
    const email = req.user.email; const source = req.app.locals.db.database.prepare('SELECT * FROM conversations WHERE id = ? AND email = ?').get(req.params.id, email);
    if (!source) return res.status(404).json({ message: 'Conversation not found' });
    const messages = JSON.parse(source.messages || '[]').slice(0, Math.max(1, Number(req.body.messageCount) || 1)); const id = `branch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; const now = new Date().toISOString();
    req.app.locals.db.database.prepare('INSERT INTO conversations (id, email, model, title, messages, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, email, req.body.model || source.model, `${source.title} (branch)`, JSON.stringify(messages), now, now);
    return res.status(201).json({ id, email, model: req.body.model || source.model, title: `${source.title} (branch)`, messages, createdAt: now, updatedAt: now });
};

const webResearch = async (req, res) => {
    const query = String(req.body.query || '').trim().slice(0, 300);
    if (!query) return res.status(400).json({ message: 'Research query is required' });
    const decodeHtml = (value) => String(value || '').replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
    const searchDuckDuckGo = async (searchQuery) => {
        const response=await fetch('https://html.duckduckgo.com/html/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'Mozilla/5.0 (compatible; AllModelAI/1.0)'},body:new URLSearchParams({q:searchQuery}).toString()});
        if(!response.ok)return[];const html=await response.text();const links=[...html.matchAll(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];const snippets=[...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>|class="result__snippet"[^>]*>([\s\S]*?)<\/div>/gi)];
        return links.slice(0,8).map((match,index)=>{let url=match[1].replaceAll('&amp;','&');try{const parsed=new URL(url.startsWith('//')?`https:${url}`:url);url=parsed.searchParams.get('uddg')?decodeURIComponent(parsed.searchParams.get('uddg')):url}catch{}return{title:decodeHtml(match[2]),url,excerpt:decodeHtml(snippets[index]?.[1]||snippets[index]?.[2]||'Open this result to read more.').slice(0,700)}}).filter((source)=>/^https?:\/\//.test(source.url));
    };
    const searchBing = async (searchQuery) => {
        const response=await fetch(`https://www.bing.com/search?format=rss&q=${encodeURIComponent(searchQuery)}`,{headers:{'User-Agent':'Mozilla/5.0 (compatible; AllModelAI/1.0)'}});
        if(!response.ok)return[];const xml=await response.text();return[...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0,8).map((match)=>{const item=match[1];const value=(tag)=>decodeHtml(item.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`,'i'))?.[1]?.replace(/<!\[CDATA\[|\]\]>/g,'')||'');return{title:value('title'),url:value('link'),excerpt:value('description').slice(0,700)}}).filter((source)=>source.title&&/^https?:\/\//.test(source.url));
    };
    try {
        const simplified=/iphone|айфон/i.test(query)?'купить недорогой iphone украина грн':query.toLowerCase().replace(/найти мне|покажи|список|самых|пожалуйста/gi,' ').replace(/гривнах|гривны|гривен/gi,'грн').replace(/недорогих|дешевых/gi,'недорогой').replace(/\s+/g,' ').trim();
        let sources=await searchBing(query);
        if(!sources.length)sources=await searchBing(simplified);
        if(!sources.length)sources=await searchDuckDuckGo(simplified);
        if (!sources.length) {
            const language=/[а-яіїєґ]/i.test(query)?'uk':'en';
            const wikiUrl=`https://${language}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=6&prop=extracts|info&exintro=1&explaintext=1&inprop=url&format=json&origin=*`;
            const wikiResponse=await fetch(wikiUrl,{headers:{'User-Agent':'AllModelAI/1.0 educational research workspace'}});
            const data=wikiResponse.ok?await wikiResponse.json():{};
            sources=Object.values(data.query?.pages||{}).sort((a,b)=>(a.index||0)-(b.index||0)).map((page)=>({title:page.title,url:page.fullurl,excerpt:String(page.extract||'').slice(0,1200)}));
        }
        return res.json({ query, sources, summary:sources.map((source,index)=>`[${index+1}] ${source.title}: ${source.excerpt}`).join('\n\n') });
    } catch (error) {
        console.error('[WEB RESEARCH]', error.message);
        return res.status(502).json({ message: 'Could not reach the web research provider' });
    }
};

const getOllamaModels = async (_req, res) => {
    try {
        const response = await fetch(`${process.env.OLLAMA_URL || 'http://127.0.0.1:11434'}/api/tags`);
        if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
        const data = await response.json();
        return res.json({ online:true, models:(data.models||[]).map((model)=>({ name:model.name, size:model.size, modifiedAt:model.modified_at })) });
    } catch {
        return res.status(503).json({ online:false, models:[], message:'Ollama is not running. Start Ollama on this computer to use free local models.' });
    }
};

const checkAnswerQuality = (req, res) => {
    const text = String(req.body.text || '').trim().slice(0, 30000);
    if (!text) return res.status(400).json({ message:'Answer text is required' });
    const words=text.split(/\s+/).filter(Boolean); const sentences=text.split(/[.!?]+/).filter((item)=>item.trim());
    const hasStructure=/\n\s*[-*\d]|#{1,3}\s/.test(text); const hasSources=/https?:\/\/|\[[0-9]+\]/.test(text); const hedging=(text.match(/maybe|possibly|perhaps|возможно|вероятно/gi)||[]).length;
    const clarity=Math.min(100,45+Math.min(words.length,250)/5+(hasStructure?12:0));
    const completeness=Math.min(100,35+Math.min(sentences.length,12)*4+(words.length>120?12:0));
    const evidence=Math.min(100,25+(hasSources?50:0)+(hedging<4?10:0));
    const score=Math.round((clarity+completeness+evidence)/3);
    const suggestions=[]; if(words.length<60)suggestions.push('Add more concrete detail.'); if(!hasStructure)suggestions.push('Use headings or a short list for readability.'); if(!hasSources)suggestions.push('Add sources for factual claims.'); if(!suggestions.length)suggestions.push('The answer is well structured; verify important facts before publishing.');
    return res.json({ score, metrics:{ clarity:Math.round(clarity), completeness:Math.round(completeness), evidence:Math.round(evidence) }, suggestions });
};

const tokenize = (value) => [...new Set(String(value || '').toLowerCase().match(/[\p{L}\p{N}_-]{3,}/gu) || [])].slice(0, 40);
const findKnowledge = (database, email, query, limit = 5) => {
    const terms = tokenize(query);
    if (!terms.length) return [];
    return database.prepare("SELECT * FROM workspace_items WHERE email = ? AND type = 'document' ORDER BY updated_at DESC").all(email)
        .map((row) => {
            const data = JSON.parse(row.data); const content = `${data.name || ''}\n${data.content || ''}`; const lower = content.toLowerCase();
            const score = terms.reduce((total, term) => total + (lower.includes(term) ? 1 : 0), 0);
            const firstMatch = terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0).sort((a, b) => a - b)[0] || 0;
            return { id: row.id, name: data.name || 'Untitled document', score, excerpt: content.slice(Math.max(0, firstMatch - 180), firstMatch + 1000).trim() };
        }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, Math.min(Number(limit) || 5, 10));
};

const getSharedPromptTemplates = (req, res) => {
    const rows = req.app.locals.db.database.prepare("SELECT * FROM workspace_items WHERE type = 'prompt' AND json_extract(data, '$.shared') = 'true' ORDER BY updated_at DESC").all();
    const items = rows.map(parseWorkspaceItem).map((item) => ({ ...item, rating: Number(item.rating || 0) }));
    return res.json(items);
};

const rateSharedPromptTemplate = (req, res) => {
    const id = String(req.params.id || '');
    if (!id) return res.status(400).json({ message: 'Template id is required' });
    const row = req.app.locals.db.database.prepare('SELECT * FROM workspace_items WHERE id = ?').get(id);
    if (!row || row.type !== 'prompt') return res.status(404).json({ message: 'Template not found' });
    const data = JSON.parse(row.data);
    if (!data.shared) return res.status(403).json({ message: 'Only shared templates can be rated' });
    const delta = req.body.direction === 'down' ? -1 : req.body.direction === 'clear' ? -Number(data.rating || 0) : 1;
    const rating = Math.max(0, Number(data.rating || 0) + delta);
    const updated = { ...data, rating };
    req.app.locals.db.database.prepare('UPDATE workspace_items SET data = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(updated), new Date().toISOString(), row.id);
    return res.json({ id, rating });
};

const chatSuggestions = (req, res) => {
    const last = String(req.body.lastMessage || '').trim();
    if (!last) return res.json({ suggestions: ['Summarize this', 'Give examples', 'Turn this into a checklist'] });
    const lower = last.toLowerCase();
    const suggestions = [];
    if (/\b(function|method|component|class|api|bug|error|code|js|react|python)\b/i.test(lower)) suggestions.push('Explain this like I’m a junior developer');
    if (/[^\s]/.test(last) && !/^[.!?]+$/.test(last)) suggestions.push('Give a shorter summary');
    if (/[.!?]/.test(last)) suggestions.push('Rewrite this more clearly');
    if (/[а-яіїєґ]/i.test(last)) suggestions.push('Сформулюй 3 висновки');
    if (/[а-яіїєґ]/i.test(last)) suggestions.push('Зроби короткий план дій');
    while (suggestions.length < 3) suggestions.push('Ask a follow-up question', 'Give a step-by-step answer', 'Show practical examples')[suggestions.length] || 'Continue with more detail';
    return res.json({ suggestions: suggestions.slice(0, 3) });
};

const searchKnowledge = (req, res) => {
    const query = String(req.body.query || '').trim();
    if (!query) return res.status(400).json({ message: 'Search query is required' });
    return res.json({ query, results: findKnowledge(req.app.locals.db.database, req.user.email, query, req.body.limit) });
};

const teamAccess = (database, teamId, email) => database.prepare(`SELECT teams.*, team_members.role FROM teams JOIN team_members ON team_members.team_id = teams.id WHERE teams.id = ? AND team_members.email = ?`).get(teamId, email);
const teamPayload = (database, team) => ({ ...team, members: database.prepare('SELECT email, role, created_at AS createdAt FROM team_members WHERE team_id = ? ORDER BY created_at').all(team.id) });
const getTeams = (req, res) => { const database=req.app.locals.db.database; const rows=database.prepare('SELECT teams.*, team_members.role FROM teams JOIN team_members ON team_members.team_id = teams.id WHERE team_members.email = ? ORDER BY teams.created_at DESC').all(req.user.email); return res.json(rows.map((row)=>teamPayload(database,row))); };
const createTeam = (req, res) => { const name=String(req.body.name||'').trim().slice(0,80);if(!name)return res.status(400).json({message:'Team name is required'});const id=`team-${crypto.randomUUID()}`;const now=new Date().toISOString();const database=req.app.locals.db.database;database.transaction(()=>{database.prepare('INSERT INTO teams (id,name,owner_email,created_at) VALUES (?,?,?,?)').run(id,name,req.user.email,now);database.prepare('INSERT INTO team_members (team_id,email,role,created_at) VALUES (?,?,?,?)').run(id,req.user.email,'owner',now)})();return res.status(201).json(teamPayload(database,{id,name,owner_email:req.user.email,created_at:now,role:'owner'})); };
const inviteTeamMember = (req,res) => {const database=req.app.locals.db.database;const access=teamAccess(database,req.params.id,req.user.email);if(!access||!['owner','editor'].includes(access.role))return res.status(403).json({message:'Only owners and editors can invite members'});const email=cleanEmail(req.body.email);const role=['editor','viewer'].includes(req.body.role)?req.body.role:'viewer';if(!email)return res.status(400).json({message:'Member email is required'});database.prepare('INSERT INTO team_members (team_id,email,role,created_at) VALUES (?,?,?,?) ON CONFLICT(team_id,email) DO UPDATE SET role=excluded.role').run(req.params.id,email,role,new Date().toISOString());return res.status(201).json(teamPayload(database,access));};
const updateTeamMember = (req,res) => {const database=req.app.locals.db.database;const access=teamAccess(database,req.params.id,req.user.email);if(!access||access.role!=='owner')return res.status(403).json({message:'Only the owner can change roles'});const email=cleanEmail(req.params.email);if(email===access.owner_email)return res.status(400).json({message:'The owner role cannot be changed'});const role=['editor','viewer'].includes(req.body.role)?req.body.role:null;if(!role)return res.status(400).json({message:'Role must be editor or viewer'});const result=database.prepare('UPDATE team_members SET role=? WHERE team_id=? AND email=?').run(role,req.params.id,email);return result.changes?res.json(teamPayload(database,access)):res.status(404).json({message:'Member not found'});};
const removeTeamMember = (req,res) => {const database=req.app.locals.db.database;const access=teamAccess(database,req.params.id,req.user.email);if(!access||access.role!=='owner')return res.status(403).json({message:'Only the owner can remove members'});const email=cleanEmail(req.params.email);if(email===access.owner_email)return res.status(400).json({message:'The owner cannot be removed'});const result=database.prepare('DELETE FROM team_members WHERE team_id=? AND email=?').run(req.params.id,email);return result.changes?res.json({message:'Member removed'}):res.status(404).json({message:'Member not found'});};
const shareConversation = (req,res) => {const database=req.app.locals.db.database;const conversation=database.prepare('SELECT id FROM conversations WHERE id=? AND email=?').get(req.params.id,req.user.email);if(!conversation)return res.status(404).json({message:'Conversation not found'});let share=database.prepare('SELECT token FROM shared_conversations WHERE conversation_id=? AND owner_email=?').get(conversation.id,req.user.email);if(!share){share={token:crypto.randomBytes(24).toString('base64url')};database.prepare('INSERT INTO shared_conversations (token,conversation_id,owner_email,created_at) VALUES (?,?,?,?)').run(share.token,conversation.id,req.user.email,new Date().toISOString());}return res.json({token:share.token,url:`${frontendOrigin()}/shared/${share.token}`});};
const getSharedConversation = (req,res) => {const row=req.app.locals.db.database.prepare('SELECT conversations.title,conversations.model,conversations.messages,shared_conversations.created_at AS sharedAt FROM shared_conversations JOIN conversations ON conversations.id=shared_conversations.conversation_id WHERE shared_conversations.token=?').get(req.params.token);if(!row)return res.status(404).json({message:'Shared conversation not found'});return res.json({...row,messages:normalizeMessages(JSON.parse(row.messages))});};

const recordArenaVote = (req, res) => {
    const userEmail = req.user.email;
    const { model_a, model_b, winner } = req.body;
    if (!model_a || !model_b || !winner) {
        return res.status(400).json({ message: 'model_a, model_b, and winner are required' });
    }
    const allowedWinners = ['model_a', 'model_b', 'tie'];
    if (!allowedWinners.includes(winner)) {
        return res.status(400).json({ message: 'Invalid winner value' });
    }
    const now = new Date().toISOString();
    try {
        req.app.locals.db.database.prepare(
            'INSERT INTO arena_votes (user_email, model_a, model_b, winner, created_at) VALUES (?, ?, ?, ?, ?)'
        ).run(userEmail, model_a, model_b, winner, now);
        return res.status(201).json({ message: 'Vote recorded successfully' });
    } catch (error) {
        console.error('[ARENA VOTE ERROR]', error.message);
        return res.status(500).json({ message: 'Database error recording vote' });
    }
};

const getArenaLeaderboard = (req, res) => {
    try {
        const votes = req.app.locals.db.database.prepare(
            'SELECT model_a, model_b, winner FROM arena_votes'
        ).all();

        const candidateModels = ['gpt', 'claude', 'gemini', 'cloudflare', 'deepseek', 'llama', 'grok', 'copilot', 'perplexity', 'kimi', 'mistral', 'qwen', 'cohere'];
        const stats = {};
        candidateModels.forEach(model => {
            stats[model] = {
                model,
                elo: 1200,
                matches: 0,
                wins: 0,
                losses: 0,
                ties: 0
            };
        });

        votes.forEach(vote => {
            const { model_a, model_b, winner } = vote;

            if (!stats[model_a]) {
                stats[model_a] = { model: model_a, elo: 1200, matches: 0, wins: 0, losses: 0, ties: 0 };
            }
            if (!stats[model_b]) {
                stats[model_b] = { model: model_b, elo: 1200, matches: 0, wins: 0, losses: 0, ties: 0 };
            }

            stats[model_a].matches += 1;
            stats[model_b].matches += 1;

            const eloA = stats[model_a].elo;
            const eloB = stats[model_b].elo;

            const expectedA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
            const expectedB = 1 / (1 + Math.pow(10, (eloA - eloB) / 400));

            let scoreA = 0.5;
            let scoreB = 0.5;

            if (winner === 'model_a') {
                scoreA = 1;
                scoreB = 0;
                stats[model_a].wins += 1;
                stats[model_b].losses += 1;
            } else if (winner === 'model_b') {
                scoreA = 0;
                scoreB = 1;
                stats[model_a].losses += 1;
                stats[model_b].wins += 1;
            } else {
                stats[model_a].ties += 1;
                stats[model_b].ties += 1;
            }

            const kFactor = 32;
            stats[model_a].elo = Math.round(eloA + kFactor * (scoreA - expectedA));
            stats[model_b].elo = Math.round(eloB + kFactor * (scoreB - expectedB));
        });

        const leaderboard = Object.values(stats).map(m => {
            const winRate = m.matches > 0 
                ? Number(((m.wins + 0.5 * m.ties) / m.matches * 100).toFixed(1))
                : 0;
            return {
                ...m,
                winRate
            };
        }).sort((first, second) => second.elo - first.elo);

        return res.status(200).json(leaderboard);
    } catch (error) {
        console.error('[ARENA LEADERBOARD ERROR]', error.message);
        return res.status(500).json({ message: 'Database error retrieving leaderboard' });
    }
};

const improvePrompt = async (req, res) => {
    const { prompt } = req.body;
    if (!prompt || !prompt.trim()) {
        return res.status(400).json({ message: 'Prompt is required' });
    }
    const apiKey = process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY || process.env.API_KEY;
    if (!apiKey) {
        return res.status(503).json({ message: 'Gemini or OpenRouter API key is not configured' });
    }
    const isGeminiDirect = Boolean(process.env.GEMINI_API_KEY);
    const systemPrompt = `You are a prompt engineering expert. Take the user's raw, basic prompt and rewrite it into a highly effective, structured, and detailed prompt. Preserve the language of the prompt. Return ONLY the improved prompt text. No explanations, no markdown wrapper, no quotes. Just the prompt text itself.\n\nRaw prompt: "${prompt}"`;
    try {
        let apiResponse;
        if (isGeminiDirect) {
            const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
            apiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey.trim())}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: systemPrompt }] }] })
            });
            if (!apiResponse.ok) throw new Error(`Gemini API returned ${apiResponse.status}`);
            const data = await apiResponse.json();
            const improvedText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (!improvedText) throw new Error('No content returned from Gemini');
            return res.json({ improvedPrompt: improvedText });
        } else {
            apiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey.trim()}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'google/gemini-2.5-flash',
                    messages: [{ role: 'user', content: systemPrompt }]
                })
            });
            if (!apiResponse.ok) throw new Error(`OpenRouter returned ${apiResponse.status}`);
            const data = await apiResponse.json();
            const improvedText = data.choices?.[0]?.message?.content?.trim();
            if (!improvedText) throw new Error('No content returned from OpenRouter');
            return res.json({ improvedPrompt: improvedText });
        }
    } catch (error) {
        console.error('[IMPROVE PROMPT ERROR]', error.message);
        return res.status(502).json({ message: 'Could not improve the prompt due to an upstream error.' });
    }
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
    getCommunityUsers,
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
    createCheckoutSession,
    verifyCheckoutSession,
    stripeWebhook,
    createChatResponse,
    generateImage,
    getWorkspaceItems,
    createWorkspaceItem,
    updateWorkspaceItem,
    deleteWorkspaceItem,
    getUsageAnalytics,
    branchConversation,
    webResearch,
    getOllamaModels,
    checkAnswerQuality,
    previewRouter,
    searchKnowledge,
    getTeams,
    createTeam,
    inviteTeamMember,
    updateTeamMember,
    removeTeamMember,
    shareConversation,
    getSharedConversation,
    getSharedPromptTemplates,
    rateSharedPromptTemplate,
    chatSuggestions,
    recordArenaVote,
    getArenaLeaderboard,
    improvePrompt,
};
