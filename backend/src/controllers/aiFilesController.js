const aiFileService = require('../services/aiFileManager/aiFileService');
const knowledgeBaseController = require('./knowledgeBaseController');

async function listAiFiles(req, res) {
    try {
        const files = await aiFileService.listFiles(req.app.locals.db, req.user.email, { q: req.query.q });
        return res.json({ files });
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.message, code: error.code });
    }
}

async function uploadAiFile(req, res) {
    try {
        const result = await aiFileService.uploadFile(req.app.locals.db, req.user.email, req.body || {}, { ip: req.ip });
        return res.status(201).json(result);
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.message, code: error.code });
    }
}

async function renameAiFile(req, res) {
    try {
        const result = await aiFileService.renameFile(req.app.locals.db, req.user.email, req.params.id, req.body?.name);
        return res.json(result);
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.message, code: error.code });
    }
}

async function deleteAiFile(req, res) {
    try {
        const result = await aiFileService.deleteFile(req.app.locals.db, req.user.email, req.params.id, { ip: req.ip });
        return res.json(result);
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.message, code: error.code });
    }
}

async function askAiFiles(req, res) {
    try {
        const result = await aiFileService.askAboutFiles(req.app.locals.db, req.user.email, req.body || {});
        // Reuse knowledge grounded query synthesis when available.
        if (result.grounded && typeof knowledgeBaseController.queryKnowledgeBase === 'function') {
            req.body = { query: req.body.query, topK: req.body.topK };
            return knowledgeBaseController.queryKnowledgeBase(req, res);
        }
        return res.json(result);
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.message, code: error.code });
    }
}

module.exports = {
    listAiFiles,
    uploadAiFile,
    renameAiFile,
    deleteAiFile,
    askAiFiles,
};
