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
    createChatResponse,
    generateImage,
    getWorkspaceItems, createWorkspaceItem, updateWorkspaceItem, deleteWorkspaceItem, getUsageAnalytics, branchConversation, webResearch, getOllamaModels, checkAnswerQuality,
    previewRouter, searchKnowledge, getTeams, createTeam, inviteTeamMember, updateTeamMember, removeTeamMember, shareConversation, getSharedConversation, listDeveloperKeys, createDeveloperKey, revokeDeveloperKey,
    getSharedPromptTemplates, rateSharedPromptTemplate, chatSuggestions, recordArenaVote, getArenaLeaderboard, improvePrompt,
} = require('../controllers/controllers');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { health, globalSearch, listJobs, createJob, cancelJob, listNotifications, readNotification, usageReport, auditLog, listWebhooks, createWebhook, deleteWebhook, privacyExport, requestEmailVerification, confirmEmailVerification, requestPasswordReset, confirmPasswordReset } = require('../controllers/production');

const router = express.Router();

router.post('/auth/register', registerUser);
router.post('/auth/login', loginUser);
router.get('/auth/:provider/accounts', getSocialAccounts);
router.post('/auth/social', socialLogin);
router.get('/auth/google', startGoogleAuth);
router.get('/auth/google/callback', googleCallback);
router.get('/auth/session', getSession);
router.post('/auth/logout', logout);
router.post('/auth/password-reset/request', requestPasswordReset);
router.post('/auth/password-reset/confirm', confirmPasswordReset);
router.get('/status/models', getModelStatus);
router.get('/health', health);
router.get('/community/users', getCommunityUsers);
router.get('/admin/stats', getAdminStats);
router.get('/share/:token', getSharedConversation);

router.delete('/auth/account', requireAuth, deleteAccount);
router.post('/chat', requireAuth, createChatResponse);
router.post('/chat/improve-prompt', requireAuth, improvePrompt);
router.post('/router/preview', requireAuth, previewRouter);
router.post('/images', requireAuth, generateImage);
router.post('/purchases', requireAuth, createPurchase);
router.post('/payments/checkout', requireAuth, createCheckoutSession);
router.get('/payments/session/:sessionId', requireAuth, verifyCheckoutSession);
router.get('/credits', requireAuth, getCredits);
router.get('/chat/history', requireAuth, getChatHistory);
router.post('/chat/history', requireAuth, createChatHistory);
router.patch('/chat/history/:id', requireAuth, renameChat);
router.delete('/chat/history/:id', requireAuth, deleteChat);
router.post('/chat/history/:id/branch', requireAuth, branchConversation);
router.post('/chat/history/:id/share', requireAuth, shareConversation);
router.get('/workspace', requireAuth, getWorkspaceItems);
router.post('/workspace', requireAuth, createWorkspaceItem);
router.patch('/workspace/:id', requireAuth, updateWorkspaceItem);
router.delete('/workspace/:id', requireAuth, deleteWorkspaceItem);
router.post('/knowledge/search', requireAuth, searchKnowledge);
router.get('/analytics', requireAuth, getUsageAnalytics);
router.post('/research', requireAuth, webResearch);
router.get('/ollama/models', requireAuth, getOllamaModels);
router.post('/quality/check', requireAuth, checkAnswerQuality);
router.get('/teams', requireAuth, getTeams);
router.post('/teams', requireAuth, createTeam);
router.post('/teams/:id/members', requireAuth, inviteTeamMember);
router.patch('/teams/:id/members/:email', requireAuth, updateTeamMember);
router.delete('/teams/:id/members/:email', requireAuth, removeTeamMember);
router.get('/prompts', requireAuth, getSharedPromptTemplates);
router.post('/prompts/:id/rate', requireAuth, rateSharedPromptTemplate);
router.post('/chat/suggestions', requireAuth, chatSuggestions);
router.post('/arena/vote', requireAuth, recordArenaVote);
router.get('/arena/leaderboard', requireAuth, getArenaLeaderboard);
router.get('/developer/keys', requireAuth, listDeveloperKeys);
router.post('/developer/keys', requireAuth, createDeveloperKey);
router.delete('/developer/keys/:id', requireAuth, revokeDeveloperKey);
router.get('/search', requireAuth, globalSearch);
router.get('/jobs', requireAuth, listJobs);
router.post('/jobs', requireAuth, createJob);
router.delete('/jobs/:id', requireAuth, cancelJob);
router.get('/notifications', requireAuth, listNotifications);
router.patch('/notifications/:id/read', requireAuth, readNotification);
router.get('/usage/report', requireAuth, usageReport);
router.get('/audit', requireAuth, auditLog);
router.get('/webhooks', requireAuth, listWebhooks);
router.post('/webhooks', requireAuth, createWebhook);
router.delete('/webhooks/:id', requireAuth, deleteWebhook);
router.get('/privacy/export', requireAuth, privacyExport);
router.post('/auth/verify/request', requireAuth, requestEmailVerification);
router.post('/auth/verify/confirm', requireAuth, confirmEmailVerification);
router.get('/users', requireAdmin, getUsers);
router.get('/users/:id', requireAdmin, getUserById);
router.post('/users', requireAdmin, createUser);
router.put('/users/:id', requireAdmin, updateUser);
router.patch('/users/:id', requireAdmin, patchUser);
router.delete('/users/:id', requireAdmin, deleteUser);

module.exports = router;
