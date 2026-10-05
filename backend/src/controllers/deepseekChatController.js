const { chatWithDeepSeek, DeepSeekChatError } = require('../services/deepseekOpenRouterChat');

async function postDeepSeekChat(req, res) {
    try {
        const reply = await chatWithDeepSeek(req.body?.message);
        return res.json({ reply });
    } catch (error) {
        if (error instanceof DeepSeekChatError) {
            return res.status(error.status).json({ message: error.message });
        }
        return res.status(502).json({ message: 'Unexpected error while calling DeepSeek.' });
    }
}

module.exports = {
    postDeepSeekChat,
};
