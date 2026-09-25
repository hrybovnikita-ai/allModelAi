const crypto = require('crypto');

const IDEAS = new Set([
    'chat-history',
    'favorite-prompts',
    'chat-settings',
    'builder-projects',
    'usage-daily',
    'model-bookmarks',
    'attachments',
    'training-runs',
]);

const newId = (prefix) =>
    `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

const parseJson = (value, fallback) => {
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
};

const ideaMeta = {
    'chat-history': {
        title: 'История чатов',
        description: 'Сохранённые диалоги с моделями на вашем аккаунте.',
    },
    'favorite-prompts': {
        title: 'Избранные промпты',
        description: 'Удачные запросы, которые можно быстро вставить в чат.',
    },
    'chat-settings': {
        title: 'Настройки чата',
        description: 'Модель по умолчанию, температура и режим роутера.',
    },
    'builder-projects': {
        title: 'Проекты билдера',
        description: 'Черновики сайтов и приложений из Website Builder.',
    },
    'usage-daily': {
        title: 'Использование по дням',
        description: 'Сколько запросов ушло в AI за каждый день.',
    },
    'model-bookmarks': {
        title: 'Закладки моделей',
        description: 'Часто используемые модели в одном списке.',
    },
    attachments: {
        title: 'Вложения к сообщениям',
        description: 'Файлы и заметки, привязанные к диалогам.',
    },
    'training-runs': {
        title: 'Журнал обучения',
        description: 'Запуски PyTorch AI Lab с метриками.',
    },
};

const listChatHistory = (database, email) =>
    database
        .prepare(
            `SELECT id, model, title, created_at AS createdAt, updated_at AS updatedAt,
             length(messages) AS messageBytes
             FROM conversations WHERE email = ? ORDER BY updated_at DESC LIMIT 100`
        )
        .all(email);

const listFavoritePrompts = (database, email) =>
    database
        .prepare(
            'SELECT id, title, content, created_at AS createdAt FROM storage_favorite_prompts WHERE email = ? ORDER BY created_at DESC'
        )
        .all(email);

const getChatSettings = (database, email) => {
    const row = database
        .prepare('SELECT settings, updated_at AS updatedAt FROM storage_chat_settings WHERE email = ?')
        .get(email);
    if (!row) {
        return {
            defaultModel: 'smart',
            temperature: 0.7,
            webSearch: false,
            routerMode: 'balanced',
            responseLanguage: 'auto',
            updatedAt: null,
        };
    }
    return { ...parseJson(row.settings, {}), updatedAt: row.updatedAt };
};

const listBuilderProjects = (database, email) =>
    database
        .prepare(
            'SELECT id, kind, name, payload, created_at AS createdAt, updated_at AS updatedAt FROM storage_builder_projects WHERE email = ? ORDER BY updated_at DESC'
        )
        .all(email)
        .map((row) => ({
            id: row.id,
            kind: row.kind,
            name: row.name,
            ...parseJson(row.payload, {}),
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        }));

const listUsageDaily = (database, email) =>
    database
        .prepare(
            `SELECT substr(created_at, 1, 10) AS day,
             COUNT(*) AS requests,
             SUM(input_tokens + output_tokens) AS tokens
             FROM usage_events WHERE email = ?
             GROUP BY day ORDER BY day DESC LIMIT 30`
        )
        .all(email);

const listModelBookmarks = (database, email) =>
    database
        .prepare(
            'SELECT model_id AS modelId, label, created_at AS createdAt FROM storage_model_bookmarks WHERE email = ? ORDER BY created_at DESC'
        )
        .all(email);

const listAttachments = (database, email) =>
    database
        .prepare(
            `SELECT id, conversation_id AS conversationId, message_index AS messageIndex,
             file_name AS fileName, mime_type AS mimeType,
             substr(content, 1, 120) AS preview, created_at AS createdAt
             FROM storage_message_attachments WHERE email = ? ORDER BY created_at DESC`
        )
        .all(email);

const listTrainingRuns = (database, email) =>
    database
        .prepare(
            'SELECT id, config, metrics, created_at AS createdAt FROM storage_training_runs WHERE email = ? ORDER BY created_at DESC LIMIT 50'
        )
        .all(email)
        .map((row) => ({
            id: row.id,
            config: parseJson(row.config, {}),
            metrics: parseJson(row.metrics, {}),
            createdAt: row.createdAt,
        }));

const listByIdea = (database, email, idea) => {
    switch (idea) {
        case 'chat-history':
            return listChatHistory(database, email);
        case 'favorite-prompts':
            return listFavoritePrompts(database, email);
        case 'chat-settings':
            return getChatSettings(database, email);
        case 'builder-projects':
            return listBuilderProjects(database, email);
        case 'usage-daily':
            return listUsageDaily(database, email);
        case 'model-bookmarks':
            return listModelBookmarks(database, email);
        case 'attachments':
            return listAttachments(database, email);
        case 'training-runs':
            return listTrainingRuns(database, email);
        default:
            return null;
    }
};

const getStorageOverview = (req, res) => {
    const email = req.user.email;
    const database = req.app.locals.db.database;

    const counts = {
        chatHistory: database.prepare('SELECT COUNT(*) AS c FROM conversations WHERE email = ?').get(email).c,
        favoritePrompts: database.prepare('SELECT COUNT(*) AS c FROM storage_favorite_prompts WHERE email = ?').get(email).c,
        chatSettings: database.prepare('SELECT COUNT(*) AS c FROM storage_chat_settings WHERE email = ?').get(email).c,
        builderProjects: database.prepare('SELECT COUNT(*) AS c FROM storage_builder_projects WHERE email = ?').get(email).c,
        usageDays: database.prepare('SELECT COUNT(DISTINCT substr(created_at, 1, 10)) AS c FROM usage_events WHERE email = ?').get(email).c,
        modelBookmarks: database.prepare('SELECT COUNT(*) AS c FROM storage_model_bookmarks WHERE email = ?').get(email).c,
        attachments: database.prepare('SELECT COUNT(*) AS c FROM storage_message_attachments WHERE email = ?').get(email).c,
        trainingRuns: database.prepare('SELECT COUNT(*) AS c FROM storage_training_runs WHERE email = ?').get(email).c,
    };

    return res.json({
        ideas: Object.entries(ideaMeta).map(([id, meta]) => ({
            id,
            ...meta,
            count: {
                'chat-history': counts.chatHistory,
                'favorite-prompts': counts.favoritePrompts,
                'chat-settings': counts.chatSettings ? 1 : 0,
                'builder-projects': counts.builderProjects,
                'usage-daily': counts.usageDays,
                'model-bookmarks': counts.modelBookmarks,
                attachments: counts.attachments,
                'training-runs': counts.trainingRuns,
            }[id],
        })),
    });
};

const listStorageIdea = (req, res) => {
    const idea = String(req.params.idea || '');
    if (!IDEAS.has(idea)) {
        return res.status(400).json({ message: 'Unknown storage idea.' });
    }
    const items = listByIdea(req.app.locals.db.database, req.user.email, idea);
    return res.json(items);
};

const createStorageIdea = (req, res) => {
    const idea = String(req.params.idea || '');
    const email = req.user.email;
    const database = req.app.locals.db.database;
    const now = new Date().toISOString();

    if (idea === 'chat-history' || idea === 'usage-daily') {
        return res.status(405).json({ message: 'This storage type is read-only.' });
    }

    if (idea === 'favorite-prompts') {
        const title = String(req.body.title || 'Без названия').trim().slice(0, 120);
        const content = String(req.body.content || '').trim();
        if (!content) return res.status(400).json({ message: 'Prompt content is required.' });
        const id = newId('prompt');
        database.prepare('INSERT INTO storage_favorite_prompts (id, email, title, content, created_at) VALUES (?, ?, ?, ?, ?)').run(id, email, title, content, now);
        return res.status(201).json({ id, title, content, createdAt: now });
    }

    if (idea === 'chat-settings') {
        const settings = {
            defaultModel: String(req.body.defaultModel || 'smart').slice(0, 64),
            temperature: Math.max(0, Math.min(Number(req.body.temperature) || 0.7, 2)),
            webSearch: Boolean(req.body.webSearch),
            routerMode: String(req.body.routerMode || 'balanced').slice(0, 32),
            responseLanguage: String(req.body.responseLanguage || 'auto').slice(0, 16),
        };
        database.prepare(
            `INSERT INTO storage_chat_settings (email, settings, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(email) DO UPDATE SET settings = excluded.settings, updated_at = excluded.updated_at`
        ).run(email, JSON.stringify(settings), now);
        return res.status(201).json({ ...settings, updatedAt: now });
    }

    if (idea === 'builder-projects') {
        const kind = String(req.body.kind || 'website').slice(0, 32);
        const name = String(req.body.name || 'Untitled project').trim().slice(0, 160);
        const payload = { ...req.body };
        delete payload.kind;
        delete payload.name;
        const id = newId('build');
        database.prepare(
            'INSERT INTO storage_builder_projects (id, email, kind, name, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(id, email, kind, name, JSON.stringify(payload), now, now);
        return res.status(201).json({ id, kind, name, ...payload, createdAt: now, updatedAt: now });
    }

    if (idea === 'model-bookmarks') {
        const modelId = String(req.body.modelId || '').trim().slice(0, 64);
        if (!modelId) return res.status(400).json({ message: 'modelId is required.' });
        const label = String(req.body.label || modelId).trim().slice(0, 120);
        database.prepare(
            `INSERT INTO storage_model_bookmarks (email, model_id, label, created_at) VALUES (?, ?, ?, ?)
             ON CONFLICT(email, model_id) DO UPDATE SET label = excluded.label`
        ).run(email, modelId, label, now);
        return res.status(201).json({ modelId, label, createdAt: now });
    }

    if (idea === 'attachments') {
        const fileName = String(req.body.fileName || 'attachment.txt').trim().slice(0, 160);
        const content = String(req.body.content || '').slice(0, 500_000);
        if (!content) return res.status(400).json({ message: 'Attachment content is required.' });
        const id = newId('file');
        const conversationId = req.body.conversationId ? String(req.body.conversationId).slice(0, 64) : null;
        const messageIndex = Number.isFinite(Number(req.body.messageIndex)) ? Number(req.body.messageIndex) : null;
        const mimeType = req.body.mimeType ? String(req.body.mimeType).slice(0, 120) : 'text/plain';
        database.prepare(
            `INSERT INTO storage_message_attachments
             (id, email, conversation_id, message_index, file_name, mime_type, content, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(id, email, conversationId, messageIndex, fileName, mimeType, content, now);
        return res.status(201).json({
            id,
            conversationId,
            messageIndex,
            fileName,
            mimeType,
            preview: content.slice(0, 120),
            createdAt: now,
        });
    }

    if (idea === 'training-runs') {
        const config = req.body.config && typeof req.body.config === 'object' ? req.body.config : {};
        const metrics = req.body.metrics && typeof req.body.metrics === 'object' ? req.body.metrics : {};
        const id = newId('train');
        database.prepare(
            'INSERT INTO storage_training_runs (id, email, config, metrics, created_at) VALUES (?, ?, ?, ?, ?)'
        ).run(id, email, JSON.stringify(config), JSON.stringify(metrics), now);
        return res.status(201).json({ id, config, metrics, createdAt: now });
    }

    return res.status(400).json({ message: 'Unknown storage idea.' });
};

const deleteStorageIdea = (req, res) => {
    const idea = String(req.params.idea || '');
    const id = String(req.params.id || '');
    const email = req.user.email;
    const database = req.app.locals.db.database;

    if (idea === 'chat-history') {
        const result = database.prepare('DELETE FROM conversations WHERE id = ? AND email = ?').run(id, email);
        return result.changes ? res.json({ message: 'Deleted' }) : res.status(404).json({ message: 'Not found' });
    }

    const tables = {
        'favorite-prompts': 'storage_favorite_prompts',
        'builder-projects': 'storage_builder_projects',
        attachments: 'storage_message_attachments',
        'training-runs': 'storage_training_runs',
    };

    if (idea === 'model-bookmarks') {
        const modelId = id;
        const result = database.prepare('DELETE FROM storage_model_bookmarks WHERE email = ? AND model_id = ?').run(email, modelId);
        return result.changes ? res.json({ message: 'Deleted' }) : res.status(404).json({ message: 'Not found' });
    }

    if (idea === 'chat-settings' || idea === 'usage-daily') {
        return res.status(405).json({ message: 'This storage type cannot be deleted item-by-item.' });
    }

    const table = tables[idea];
    if (!table) return res.status(400).json({ message: 'Unknown storage idea.' });

    const result = database.prepare(`DELETE FROM ${table} WHERE id = ? AND email = ?`).run(id, email);
    return result.changes ? res.json({ message: 'Deleted' }) : res.status(404).json({ message: 'Not found' });
};

const recordTrainingRun = (database, email, config, metrics) => {
    const now = new Date().toISOString();
    const id = newId('train');
    database.prepare(
        'INSERT INTO storage_training_runs (id, email, config, metrics, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, email, JSON.stringify(config || {}), JSON.stringify(metrics || {}), now);
    return id;
};

module.exports = {
    getStorageOverview,
    listStorageIdea,
    createStorageIdea,
    deleteStorageIdea,
    recordTrainingRun,
};
