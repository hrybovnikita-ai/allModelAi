const express = require('express');
const {
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
    getWorkspaceItems, createWorkspaceItem, updateWorkspaceItem, deleteWorkspaceItem, getUsageAnalytics, branchConversation, webResearch, getOllamaModels, checkAnswerQuality,
} = require('../controllers/controllers');

const router = express.Router();

router.post('/auth/register', registerUser);
router.post('/auth/login', loginUser);
router.get('/auth/:provider/accounts', getSocialAccounts);
router.post('/auth/social', socialLogin);
router.get('/auth/google', startGoogleAuth);
router.get('/auth/google/callback', googleCallback);
router.get('/auth/session', getSession);
router.post('/auth/logout', logout);
router.delete('/auth/account', deleteAccount);
router.post('/chat', createChatResponse);
router.post('/images', generateImage);
router.post('/purchases', createPurchase);
router.get('/credits', getCredits);
router.get('/status/models', getModelStatus);
router.get('/admin/stats', getAdminStats);
router.get('/chat/history', getChatHistory);
router.post('/chat/history', createChatHistory);
router.patch('/chat/history/:id', renameChat);
router.delete('/chat/history/:id', deleteChat);
router.post('/chat/history/:id/branch', branchConversation);
router.get('/workspace', getWorkspaceItems);
router.post('/workspace', createWorkspaceItem);
router.patch('/workspace/:id', updateWorkspaceItem);
router.delete('/workspace/:id', deleteWorkspaceItem);
router.get('/analytics', getUsageAnalytics);
router.post('/research', webResearch);
router.get('/ollama/models', getOllamaModels);
router.post('/quality/check', checkAnswerQuality);
router.get('/users', getUsers);
router.get('/users/:id', getUserById);
router.post('/users', createUser);
router.put('/users/:id', updateUser);
router.patch('/users/:id', patchUser);
router.delete('/users/:id', deleteUser);

module.exports = router;
