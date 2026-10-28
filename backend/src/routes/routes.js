const express = require('express');
const {
    registerUser,
    loginUser,
    getSocialAccounts,
    socialLogin,
    quickSocialLogin,
    startGoogleAuth,
    googleCallback,
    getSession,
    logout,
    getCommunityUsers,
    getPublicUsers,
    getUsers,
    getUserById,
    createUser,
    updateUser,
    patchUser,
    deleteUser,
    deleteAccount,
    getCredits,
    setAccessMode,
    getModelStatus,
    getAdminStats,
    getChatHistory,
    getChatConversation,
    createChatHistory,
    renameChat,
    deleteChat,
    createPurchase,
    createCheckoutSession,
    createPaymentIntent,
    verifyPaymentIntent,
    verifyCheckoutSession,
    mockDeveloperSubscribe,
    getPaymentConfig,
    getPublicCheckoutInfo,
    getCheckoutPlans,
    getCheckoutPlanQuote,
    createBillingPortalSession,
    createChatResponse,
    analyzeVision,
    generateImage,
    getWorkspaceItems, createWorkspaceItem, updateWorkspaceItem, deleteWorkspaceItem, getUsageAnalytics, branchConversation, webResearch, webResearchAnswer, getOllamaModels, checkAnswerQuality,
    previewRouter, searchKnowledge, getTeams, createTeam, inviteTeamMember, updateTeamMember, removeTeamMember, shareConversation, getSharedConversation, listDeveloperKeys, createDeveloperKey, revokeDeveloperKey,
    getSharedPromptTemplates, rateSharedPromptTemplate, chatSuggestions, recordArenaVote, getArenaLeaderboard, improvePrompt,
} = require('../controllers/controllers');
const {
    getPythonLlmHealth,
    getPythonLlmModels,
    postPythonLlmChat,
} = require('../controllers/pythonLlmController');
const {
    getPyTorchStatus,
    startPyTorchTraining,
    predictPyTorch,
    resetPyTorchModel,
    getOpenAiTrainingStatus,
    augmentPyTorchDataset,
    getPyTorchQuotas,
    streamPyTorchTraining,
    listPyTorchDataset,
    createPyTorchDatasetSample,
    deletePyTorchDatasetSample,
    exportPyTorchModel,
    importPyTorchModel,
    savePyTorchModelSlot,
    getSystemHealth,
} = require('../controllers/aiPythonController');
const { postDeepSeekChat } = require('../controllers/deepseekChatController');
const { getPublicFirebaseConfig } = require('../controllers/publicFirebaseConfigController');
const {
    getLessons,
    getLessonById,
    getProgress,
    patchProgress,
    getExperiments,
    trainLinearRegression,
    trainGradientDescent,
    trainPytorchLab,
    postTutor,
    getTutorStatus,
    researchLessonTopic,
} = require('../controllers/aiTrainingController');
const {
    getAiLessons,
    getAiLesson,
    postTrainLinearRegression,
    postTrainGradientDescent,
    postTrainPytorchLinear,
    postAiPredict,
    getTrainingJob,
    getTrainingMetrics,
    postImprovementAnalyze,
} = require('../controllers/aiMlLearningController');
const {
    getTrainingHealth,
    getTrainingModels,
    postTrainingStart,
    getTrainingRun,
    postTrainingPredict,
    postTrainingOpenAiChat,
} = require('../controllers/trainingLabController');
const {
    createWayforpayPayment,
    createWayforpayCreditPayment,
    completeMockWayforpayPayment,
    completeTestWayforpayCheckout,
    getWayforpayPaymentStatus,
    getPaymentHistory,
} = require('../controllers/wayforpayController');
const { createPaddleCheckout, getPaddlePublicConfig } = require('../controllers/paddleController');
const {
    createLemonSqueezyCheckout,
    getLemonSqueezyPublicConfig,
} = require('../controllers/lemonSqueezyController');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { createUserRateLimitMiddleware } = require('../security/apiRateLimit');
const expensiveUserRateLimit = createUserRateLimitMiddleware({ scope: 'expensive' });
const { authAttemptRateLimit } = require('../authRateLimit');
const { prepareAppGeneration, prepareWebsiteRedesign } = require('../appGeneration');
const { health, healthDetailed, globalSearch, listJobs, createJob, cancelJob, listNotifications, readNotification, usageReport, auditLog, listWebhooks, createWebhook, deleteWebhook, privacyExport, requestEmailVerification, confirmEmailVerification, requestPasswordReset, confirmPasswordReset } = require('../controllers/production');
const { getReady, getOpsDashboard, getOpsDbTraffic, getOpsApiPerformance, getOpsProviders } = require('../controllers/opsCenter');
const { getAccountSecurity, setAccountPassword, updateAccountProfile } = require('../accountPassword');
const { getStorageOverview, listStorageIdea, createStorageIdea, deleteStorageIdea } = require('../controllers/storageIdeasController');
const { getSubscriptionSummary, cancelTestSubscriptionHandler } = require('../controllers/subscriptionController');
const {
    listKnowledgeDocuments,
    uploadKnowledgeDocument,
    deleteKnowledgeDocument,
    reindexKnowledgeDocument,
    queryKnowledgeBase,
} = require('../controllers/knowledgeBaseController');
const {
    listAiFiles,
    uploadAiFile,
    renameAiFile,
    deleteAiFile,
    askAiFiles,
} = require('../controllers/aiFilesController');
const {
    listWorkflowTemplates,
    listWorkflows,
    saveWorkflow,
    getWorkflow,
    deleteWorkflow,
    startWorkflowRun,
    getWorkflowRun,
    cancelWorkflowRun,
} = require('../controllers/aiWorkflowsController');
const {
    listEvaluationSuites,
    listEvaluationRuns,
    startEvaluationRun,
    getEvaluationRun,
    exportEvaluationRun,
    cancelEvaluationRun,
} = require('../controllers/evaluationLabController');
const { getOllamaStatus, postOllamaChat } = require('../controllers/ollamaController');
const { postMultiAgentResearch } = require('../controllers/multiAgentResearchController');
const {
    revealAnoninMessage,
    listAnoninRevealed,
    postAnoninChatAlias,
    gateAnoninRevealedAlias,
} = require('../controllers/anoninController');

const router = express.Router();

function registerAnoninChatRoutes() {
    router.post('/chat/anonin/reveal', requireAuth, revealAnoninMessage);
    router.post('/chat/anonim/reveal', requireAuth, revealAnoninMessage);
    router.post('/chat/anonymous/reveal', requireAuth, revealAnoninMessage);
    router.get('/chat/anonin/revealed/:conversationId', requireAuth, listAnoninRevealed);
    router.get('/chat/anonim/revealed/:conversationId', requireAuth, listAnoninRevealed);
    router.get('/chat/anonymous/revealed/:conversationId', requireAuth, listAnoninRevealed);
    router.get('/chat/:anoninAlias/revealed/:conversationId', requireAuth, gateAnoninRevealedAlias, listAnoninRevealed);
    router.post('/chat/anonin', requireAuth, postAnoninChatAlias);
    router.post('/chat/anonim', requireAuth, postAnoninChatAlias);
    router.post('/chat/anonymous', requireAuth, postAnoninChatAlias);
}

const socialAuth = require('../socialAuth');
router.post('/auth/firebase/challenge', socialAuth.browserRequest, socialAuth.challenge);
router.post('/auth/firebase', socialAuth.browserRequest, socialAuth.exchange);
router.get('/auth/connections', socialAuth.connections);
registerAnoninChatRoutes();
const { cachePublicResponse } = require('../cache');
const { logAuthStage } = require('../authRouteStages');
const {
    getHealthSummary,
    getHealthProviders,
    getHealthProviderById,
    getHealthModels,
    getHealthModelById,
    getAdminHealthProviders,
    postAdminHealthCheck,
} = require('../controllers/healthMonitorController');

// Local PyTorch AI Learning Engine routes
router.get('/python-llm/health', requireAuth, getPythonLlmHealth);
router.get('/python-llm/models', requireAuth, getPythonLlmModels);
router.post('/python-llm/chat', requireAuth, postPythonLlmChat);
router.get('/ai-python/status', getPyTorchStatus);
router.get('/ai-python/openai/status', getOpenAiTrainingStatus);
router.get('/ai-python/quotas', requireAuth, getPyTorchQuotas);
router.get('/ai-python/train/stream', requireAuth, streamPyTorchTraining);
router.get('/ai-python/dataset', requireAuth, listPyTorchDataset);
router.post('/ai-python/dataset', requireAuth, createPyTorchDatasetSample);
router.delete('/ai-python/dataset/:index', requireAuth, deletePyTorchDatasetSample);
router.get('/ai-python/export', requireAuth, exportPyTorchModel);
router.post('/ai-python/import', requireAuth, importPyTorchModel);
router.post('/ai-python/models/slot/:slot', requireAuth, savePyTorchModelSlot);
router.post('/ai-python/openai/augment', requireAuth, augmentPyTorchDataset);
router.post('/ai-python/train', requireAuth, startPyTorchTraining);
router.post('/ai-python/predict', requireAuth, predictPyTorch);
router.post('/ai-python/reset', requireAuth, resetPyTorchModel);
router.get('/ai-training/lessons', getLessons);
router.get('/ai-training/lessons/:id', getLessonById);
router.get('/ai-training/progress', requireAuth, getProgress);
router.patch('/ai-training/progress/:lessonId', requireAuth, patchProgress);
router.get('/ai-training/experiments', requireAuth, getExperiments);
router.post('/ai-training/linear-regression/train', requireAuth, trainLinearRegression);
router.post('/ai-training/gradient-descent/train', requireAuth, trainGradientDescent);
router.post('/ai-training/pytorch/train', requireAuth, trainPytorchLab);
router.post('/ai-training/tutor', requireAuth, postTutor);
router.get('/ai-training/tutor/status', getTutorStatus);
router.post('/ai-training/research', requireAuth, researchLessonTopic);
router.get('/ai/lessons', getAiLessons);
router.get('/ai/lessons/:lessonId', getAiLesson);
router.post('/ai/train/linear-regression', requireAuth, postTrainLinearRegression);
router.post('/ai/train/gradient-descent', requireAuth, postTrainGradientDescent);
router.post('/ai/train/pytorch-linear', requireAuth, postTrainPytorchLinear);
router.post('/ai/predict', requireAuth, postAiPredict);
router.get('/ai/training/:id', requireAuth, getTrainingJob);
router.get('/ai/training/:id/metrics', requireAuth, getTrainingMetrics);
router.post('/ai/improvement/analyze', requireAuth, postImprovementAnalyze);
router.get('/training/health', getTrainingHealth);
router.get('/training/models', getTrainingModels);
router.post('/training/start', requireAuth, postTrainingStart);
router.get('/training/:runId', requireAuth, getTrainingRun);
router.post('/training/:runId/predict', requireAuth, postTrainingPredict);
router.post('/training/openai/chat', requireAuth, postTrainingOpenAiChat);
router.get('/system/health', getSystemHealth);

router.post('/auth/register', authAttemptRateLimit('register'), registerUser);
router.post('/auth/login', authAttemptRateLimit('login', { emailScoped: true }), logAuthStage('AUTH_ROUTE_ENTERED'), loginUser);
router.get('/auth/account/security', requireAuth, getAccountSecurity);
router.post('/auth/account/password', requireAuth, authAttemptRateLimit('password-enroll'), setAccountPassword);
router.patch('/auth/account/profile', requireAuth, authAttemptRateLimit('profile-update', { limit: 30 }), updateAccountProfile);
router.post('/auth/quick-social', quickSocialLogin);
router.get('/auth/:provider/accounts', getSocialAccounts);
router.post('/auth/social', socialLogin);
router.get('/auth/google', startGoogleAuth);
router.get('/auth/google/callback', googleCallback);
router.get('/auth/session', logAuthStage('SESSION_ROUTE_ENTERED'), getSession);
router.get('/auth/me', logAuthStage('SESSION_ROUTE_ENTERED'), getSession);
router.post('/auth/logout', logout);
router.post('/auth/password-reset/request', authAttemptRateLimit('password-reset-request', { emailScoped: true, limit: 20 }), requestPasswordReset);
router.post('/auth/password-reset/confirm', authAttemptRateLimit('password-reset-confirm', { limit: 30 }), confirmPasswordReset);
router.post('/auth/verify/confirm', authAttemptRateLimit('email-verify-confirm', { limit: 30 }), confirmEmailVerification);
router.get('/status/models', logAuthStage('MODELS_STATUS_ROUTE_ENTERED'), getModelStatus);
router.get('/health/providers', cachePublicResponse('allmodelai:public:provider-health:v2'), getHealthProviders);
router.get('/health/summary', cachePublicResponse('allmodelai:public:health-summary:v1'), getHealthSummary);
router.get('/health/providers/:providerId', cachePublicResponse('allmodelai:public:health-provider:v1'), getHealthProviderById);
router.get('/health/models', cachePublicResponse('allmodelai:public:health-models:v1'), getHealthModels);
router.get('/health/models/:modelId', cachePublicResponse('allmodelai:public:health-model:v1'), getHealthModelById);
router.get('/admin/health/providers', requireAdmin, getAdminHealthProviders);
router.post('/admin/health/check', requireAdmin, postAdminHealthCheck);
router.get('/health', health);
router.get('/ready', getReady);
router.get('/health/detailed', healthDetailed);
router.get('/admin/ops/dashboard', requireAdmin, getOpsDashboard);
router.get('/admin/ops/db-traffic', requireAdmin, getOpsDbTraffic);
router.get('/admin/ops/api-performance', requireAdmin, getOpsApiPerformance);
router.get('/admin/ops/providers', requireAdmin, getOpsProviders);
const {
    getLiveActivationReadiness,
    getMerchantRevenue,
} = require('../controllers/merchantBillingController');
router.get('/admin/payments/activation-readiness', requireAdmin, getLiveActivationReadiness);
router.get('/admin/payments/revenue', requireAdmin, getMerchantRevenue);
const {
    getMemorySettings,
    patchMemorySettings,
    listUserMemories,
    createUserMemory,
    updateUserMemory,
    deleteUserMemory,
    clearUserMemories,
    searchUserMemories,
    postResponseFeedback,
    getAdminAiImprovementDashboard,
} = require('../controllers/aiImprovementController');
router.get('/ai/memory/settings', requireAuth, getMemorySettings);
router.patch('/ai/memory/settings', requireAuth, patchMemorySettings);
router.get('/ai/memory/search', requireAuth, searchUserMemories);
router.get('/ai/memory', requireAuth, listUserMemories);
router.post('/ai/memory', requireAuth, createUserMemory);
router.patch('/ai/memory/:id', requireAuth, updateUserMemory);
router.delete('/ai/memory/:id', requireAuth, deleteUserMemory);
router.delete('/ai/memory', requireAuth, clearUserMemories);
router.post('/ai/feedback', requireAuth, postResponseFeedback);
router.get('/admin/ai-improvement', getAdminAiImprovementDashboard);
router.get('/public/firebase-config', cachePublicResponse('allmodelai:public:firebase-web-config:v1'), getPublicFirebaseConfig);
router.get('/users', getPublicUsers);
router.get('/community/users', getCommunityUsers);
router.get('/admin/stats', getAdminStats);
router.get('/share/:token', getSharedConversation);

router.delete('/auth/account', requireAuth, deleteAccount);
router.post('/chat/deepseek', requireAuth, postDeepSeekChat);
router.post('/chat', requireAuth, expensiveUserRateLimit, createChatResponse);
router.post('/apps/generate', requireAuth, expensiveUserRateLimit, prepareAppGeneration, createChatResponse);
router.post('/apps/redesign', requireAuth, expensiveUserRateLimit, prepareWebsiteRedesign, createChatResponse);
const { postCodeAssist } = require('../controllers/codeAssistantController');
router.post('/code/assist', requireAuth, expensiveUserRateLimit, postCodeAssist);
router.post('/chat/improve-prompt', requireAuth, improvePrompt);
router.post('/vision/analyze', requireAuth, expensiveUserRateLimit, analyzeVision);
router.post('/router/preview', requireAuth, previewRouter);
const { getImageGenerationStatus, getImageGenerationJob, upscaleGeneratedImage } = require('../images');
router.get('/images/status', requireAuth, getImageGenerationStatus);
router.get('/images/jobs/:jobId', requireAuth, getImageGenerationJob);
router.get('/images/status/:jobId', requireAuth, getImageGenerationJob);
router.post('/images/upscale', requireAuth, expensiveUserRateLimit, upscaleGeneratedImage);
router.post('/images', requireAuth, expensiveUserRateLimit, generateImage);
router.post('/images/generate', requireAuth, expensiveUserRateLimit, generateImage);
const { generateVideo, getVideoGenerationStatus } = require('../videos');
const {
    postVideoGenerate,
    getVideoJob,
    getVideoJobs,
    streamVideoJob,
} = require('../controllers/videoController');
router.get('/videos/status', requireAuth, getVideoGenerationStatus);
router.post('/videos', requireAuth, generateVideo);
router.post('/videos/generate', requireAuth, generateVideo);
router.post('/video/generate', requireAuth, postVideoGenerate);
router.get('/video/jobs', requireAuth, getVideoJobs);
router.get('/video/jobs/:jobId', requireAuth, getVideoJob);
router.get('/video/jobs/:jobId/stream', requireAuth, streamVideoJob);
router.post('/purchases', requireAuth, createPurchase);
router.get('/payments/checkout-info', getPublicCheckoutInfo);
router.get('/payments/plans', getCheckoutPlans);
router.get('/payments/plans/:slug', getCheckoutPlanQuote);
router.get('/payments/config', requireAuth, getPaymentConfig);
router.post('/payments/wayforpay/create', requireAuth, createWayforpayPayment);
router.post('/payments/wayforpay/checkout', requireAuth, createWayforpayPayment);
router.post('/payments/wayforpay/credit-checkout', requireAuth, createWayforpayCreditPayment);
router.post('/payments/wayforpay/mock-complete', requireAuth, completeMockWayforpayPayment);
router.post('/payments/wayforpay/test-checkout', requireAuth, completeTestWayforpayCheckout);
router.get('/payments/wayforpay/status/:orderReference', requireAuth, getWayforpayPaymentStatus);
router.get('/payments/history', requireAuth, getPaymentHistory);
router.post('/payments/checkout', requireAuth, createCheckoutSession);
router.post('/payments/create-checkout', requireAuth, createLemonSqueezyCheckout);
router.get('/payments/lemonsqueezy/config', getLemonSqueezyPublicConfig);
router.post('/payments/paddle/checkout', requireAuth, createPaddleCheckout);
router.get('/payments/paddle/config', getPaddlePublicConfig);
router.post('/payments/billing-portal', requireAuth, createBillingPortalSession);
router.post('/payments/create-intent', requireAuth, createPaymentIntent);
router.get('/payments/intent/:intentId', requireAuth, verifyPaymentIntent);
router.post('/payments/mock-subscribe', requireAuth, mockDeveloperSubscribe);
router.get('/payments/session/:sessionId', requireAuth, verifyCheckoutSession);
const {
    getCapabilities,
    listPlatformJobs,
    getPlatformJob,
    createPlatformJob,
    cancelPlatformJob,
} = require('../controllers/platformController');
router.get('/platform/capabilities', requireAuth, getCapabilities);
router.get('/platform/jobs', requireAuth, listPlatformJobs);
router.get('/platform/jobs/:id', requireAuth, getPlatformJob);
router.post('/platform/jobs', requireAuth, createPlatformJob);
router.post('/platform/jobs/:id/cancel', requireAuth, cancelPlatformJob);
router.get('/credits', requireAuth, getCredits);
const {
    getAiCreditPackages,
    getAiCreditWallet,
    getAiCreditLedger,
    createAiCreditCheckout,
    verifyAiCreditCheckoutSession,
} = require('../controllers/aiCreditController');
const {
    createAiCreditCreemCheckout,
    getCreemCheckoutStatus,
} = require('../controllers/creemController');
router.get('/credits/packages', getAiCreditPackages);
router.get('/credits/wallet', requireAuth, getAiCreditWallet);
router.get('/credits/ledger', requireAuth, getAiCreditLedger);
router.post('/payments/credit-checkout', requireAuth, createAiCreditCheckout);
router.post('/payments/creem/credit-checkout', requireAuth, createAiCreditCreemCheckout);
router.get('/payments/creem/status', getCreemCheckoutStatus);
router.get('/payments/credit-session/:sessionId', requireAuth, verifyAiCreditCheckoutSession);
router.get('/subscription', requireAuth, getSubscriptionSummary);
router.post('/subscription/cancel-test', requireAuth, cancelTestSubscriptionHandler);
router.patch('/access-mode', requireAuth, setAccessMode);
router.get('/chat/history', requireAuth, getChatHistory);
router.get('/chat/history/:id', requireAuth, getChatConversation);
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
router.get('/knowledge/documents', requireAuth, listKnowledgeDocuments);
router.post('/knowledge/documents', requireAuth, uploadKnowledgeDocument);
router.delete('/knowledge/documents/:id', requireAuth, deleteKnowledgeDocument);
router.post('/knowledge/documents/:id/reindex', requireAuth, reindexKnowledgeDocument);
router.post('/knowledge/query', requireAuth, queryKnowledgeBase);
router.post('/agents/research', requireAuth, postMultiAgentResearch);
router.get('/analytics', requireAuth, getUsageAnalytics);

// TTS routes live in src/routes/api/tts.js and are mounted from localApp.js at /api/tts.
const { postResearchClarify, getResearchConfig } = require('../controllers/deepResearchController');
router.post('/research', requireAuth, expensiveUserRateLimit, webResearch);
router.post('/research/clarify', requireAuth, expensiveUserRateLimit, postResearchClarify);
router.get('/research/config', requireAuth, getResearchConfig);
router.post('/research/answer', requireAuth, expensiveUserRateLimit, webResearchAnswer);
router.get('/ollama/models', requireAuth, getOllamaModels);
router.get('/ollama/status', requireAuth, getOllamaStatus);
router.post('/ollama/chat', requireAuth, expensiveUserRateLimit, postOllamaChat);

router.get('/ai-files', requireAuth, listAiFiles);
router.post('/ai-files', requireAuth, expensiveUserRateLimit, uploadAiFile);
router.patch('/ai-files/:id', requireAuth, renameAiFile);
router.delete('/ai-files/:id', requireAuth, deleteAiFile);
router.post('/ai-files/ask', requireAuth, expensiveUserRateLimit, askAiFiles);

router.get('/workflows/templates', requireAuth, listWorkflowTemplates);
router.get('/workflows/runs/:runId', requireAuth, getWorkflowRun);
router.post('/workflows/runs/:runId/cancel', requireAuth, cancelWorkflowRun);
router.get('/workflows', requireAuth, listWorkflows);
router.post('/workflows', requireAuth, saveWorkflow);
router.get('/workflows/:id', requireAuth, getWorkflow);
router.delete('/workflows/:id', requireAuth, deleteWorkflow);
router.post('/workflows/:id/run', requireAuth, expensiveUserRateLimit, startWorkflowRun);

router.get('/evaluation/suites', requireAuth, listEvaluationSuites);
router.get('/evaluation/runs', requireAuth, listEvaluationRuns);
router.post('/evaluation/runs', requireAuth, expensiveUserRateLimit, startEvaluationRun);
router.get('/evaluation/runs/:id', requireAuth, getEvaluationRun);
router.get('/evaluation/runs/:id/export', requireAuth, exportEvaluationRun);
router.post('/evaluation/runs/:id/cancel', requireAuth, cancelEvaluationRun);
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
const {
    getModelDiagnosticsCatalog,
    postModelDiagnosticTest,
} = require('../controllers/modelDiagnosticsController');
router.get('/developer/model-diagnostics', requireAuth, getModelDiagnosticsCatalog);
router.post('/developer/model-diagnostics/test', requireAuth, postModelDiagnosticTest);
const { getDeveloperProviderHealth } = require('../controllers/providerHealthController');
router.get('/developer/provider-health', requireAuth, getDeveloperProviderHealth);
const {
    getIntelligenceAudit,
    getLearningDashboard,
    getKnowledgeCollections,
    postKnowledgeCollection,
    postKnowledgeRetrievalEval,
    getRouterLearning,
    postRouterCandidatePolicy,
    postPromoteRouterPolicy,
    getEvaluationSuites,
    postEvaluationRun,
    getEvaluationRuns,
    postHumanReview,
} = require('../controllers/intelligenceController');
router.get('/intelligence/audit', requireAuth, getIntelligenceAudit);
router.get('/intelligence/learning-dashboard', requireAuth, getLearningDashboard);
router.get('/intelligence/knowledge/collections', requireAuth, getKnowledgeCollections);
router.post('/intelligence/knowledge/collections', requireAuth, postKnowledgeCollection);
router.post('/intelligence/knowledge/retrieval-eval', requireAuth, postKnowledgeRetrievalEval);
router.get('/intelligence/router', requireAuth, getRouterLearning);
router.post('/intelligence/router/policies/candidate', requireAuth, postRouterCandidatePolicy);
router.post('/intelligence/router/policies/promote', requireAuth, postPromoteRouterPolicy);
router.get('/intelligence/evaluation/suites', requireAuth, getEvaluationSuites);
router.post('/intelligence/evaluation/runs', requireAuth, postEvaluationRun);
router.get('/intelligence/evaluation/runs', requireAuth, getEvaluationRuns);
router.post('/intelligence/evaluation/reviews', requireAuth, postHumanReview);
router.get('/search', requireAuth, globalSearch);
router.get('/jobs', requireAuth, listJobs);
router.post('/jobs', requireAuth, createJob);
router.delete('/jobs/:id', requireAuth, cancelJob);
router.get('/notifications', requireAuth, listNotifications);
router.patch('/notifications/:id/read', requireAuth, readNotification);
router.get('/usage/report', requireAuth, usageReport);
router.get('/storage/ideas', requireAuth, getStorageOverview);
router.get('/storage/ideas/:idea', requireAuth, listStorageIdea);
router.post('/storage/ideas/:idea', requireAuth, createStorageIdea);
router.delete('/storage/ideas/:idea/:id', requireAuth, deleteStorageIdea);
router.get('/audit', requireAuth, auditLog);
router.get('/webhooks', requireAuth, listWebhooks);
router.post('/webhooks', requireAuth, createWebhook);
router.delete('/webhooks/:id', requireAuth, deleteWebhook);
router.get('/privacy/export', requireAuth, privacyExport);
router.post('/auth/verify/request', requireAuth, authAttemptRateLimit('email-verify-request', { limit: 10 }), requestEmailVerification);
router.get('/admin/users', requireAuth, requireAdmin, getUsers);
router.get('/admin/users/:id', requireAuth, requireAdmin, getUserById);
router.post('/admin/users', requireAuth, requireAdmin, createUser);
router.put('/admin/users/:id', requireAuth, requireAdmin, updateUser);
router.patch('/admin/users/:id', requireAuth, requireAdmin, patchUser);
router.delete('/admin/users/:id', requireAuth, requireAdmin, deleteUser);

const projectExport = require('../platform/projectExport');
const credentialVault = require('../platform/credentialVault');
const webhookEvents = require('../platform/webhookEvents');
const githubAssistant = require('../platform/githubAssistant');
const qualityContracts = require('../platform/qualityContracts');

function platformError(res, error) {
    return res.status(error.status || 500).json({ message: error.message, code: error.code || 'PLATFORM_ERROR' });
}

router.get('/platform/github', requireAuth, (req, res) => {
    res.json(githubAssistant.connectionStatus(req.user.email));
});

router.post('/platform/github/connect', requireAuth, (req, res) => {
    try {
        res.json(githubAssistant.beginConnect(req.user.email));
    } catch (error) {
        platformError(res, error);
    }
});

router.delete('/platform/github', requireAuth, (req, res) => {
    res.json(githubAssistant.disconnect(req.user.email));
});

router.get('/platform/github/repos', requireAuth, async (req, res) => {
    try {
        res.json({ repositories: await githubAssistant.listRepositories(req.user.email) });
    } catch (error) {
        platformError(res, error);
    }
});

router.post('/platform/export', requireAuth, (req, res) => {
    if (req.aborted) return res.status(499).json({ message: 'Export cancelled.' });
    try {
        const packed = projectExport.prepareExport(req.body?.files, { name: req.body?.name });
        const filename = projectExport.safeDownloadName(req.body?.name);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('X-Export-Sha256', packed.sha256);
        res.setHeader('X-Export-Files', String(packed.files));
        res.send(packed.zip);
    } catch (error) {
        platformError(res, error);
    }
});

router.get('/platform/vault', requireAuth, requireAdmin, (req, res) => {
    res.json({
        credentials: credentialVault.listCredentials(),
        note: 'Identifiers are masked. Raw keys stay in the deployment environment.',
    });
});

router.post('/platform/vault/:provider', requireAuth, requireAdmin, (req, res) => {
    try {
        res.json(credentialVault.setCredentialDisabled(req.params.provider, Boolean(req.body?.disabled)));
    } catch (error) {
        platformError(res, error);
    }
});

router.get('/platform/webhooks/events', requireAuth, requireAdmin, (req, res) => {
    res.json({ events: webhookEvents.listEvents() });
});

router.post('/platform/webhooks/events', requireAuth, requireAdmin, (req, res) => {
    const secret = String(process.env.PLATFORM_WEBHOOK_SECRET || '');
    const payload = JSON.stringify(req.body?.payload || {});
    const valid = webhookEvents.verifyHmacSha256({
        secret,
        payload,
        signature: req.get('x-allmodelai-signature'),
    });
    if (!secret || !valid || !webhookEvents.assertFreshTimestamp(req.body?.timestamp)) {
        return res.status(401).json({ message: 'Webhook signature was rejected.', code: 'WEBHOOK_SIGNATURE_INVALID' });
    }
    try {
        const row = webhookEvents.rememberEvent(req.body?.eventId);
        res.status(row.duplicate ? 200 : 202).json(row);
    } catch (error) {
        platformError(res, error);
    }
});

router.get('/platform/contracts', requireAuth, (req, res) => {
    res.json({ contracts: qualityContracts.API_CONTRACTS, visualTargets: qualityContracts.VISUAL_TARGETS });
});

router.post('/platform/quality/run', requireAuth, (req, res) => {
    if (req.body?.live === true) {
        return res.status(403).json({
            message: 'Live AI quality runs are disabled unless AI_EVAL_LIVE_GENERATE is explicitly enabled by an operator.',
            code: 'LIVE_EVAL_DISABLED',
        });
    }
    res.json(qualityContracts.runMockedQualityLab());
});

const studio = require('../platform/studioFeatures');

router.get('/studio/bugs', requireAuth, (req, res) => {
    res.json({ bugs: studio.bucket(req.user.email).bugs });
});
router.post('/studio/bugs', requireAuth, (req, res) => {
    try { res.status(201).json(studio.createBug(req.user.email, req.body)); } catch (error) { platformError(res, error); }
});
router.post('/studio/bugs/:id/status', requireAuth, (req, res) => {
    try { res.json(studio.updateBugStatus(req.user.email, req.params.id, req.body?.status)); } catch (error) { platformError(res, error); }
});
router.get('/studio/schedules', requireAuth, (req, res) => {
    res.json({ tasks: studio.bucket(req.user.email).tasks });
});
router.post('/studio/schedules', requireAuth, (req, res) => {
    try { res.status(201).json(studio.createSchedule(req.user.email, req.body)); } catch (error) { platformError(res, error); }
});
router.post('/studio/schedules/:id/pause', requireAuth, (req, res) => {
    const task = studio.bucket(req.user.email).tasks.find((item) => item.id === req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found.' });
    task.status = task.status === 'paused' ? 'active' : 'paused';
    res.json(task);
});
router.post('/studio/schedules/run-due', requireAuth, (req, res) => {
    res.json({ task: studio.claimDueTask(req.user.email) });
});
router.post('/studio/datasets/analyze', requireAuth, (req, res) => {
    try { res.json(studio.analyzeCsv(req.user.email, req.body)); } catch (error) { platformError(res, error); }
});
router.get('/studio/config', requireAuth, requireAdmin, (req, res) => {
    res.json({ checks: studio.configReport(), note: 'Names and presence only.' });
});
router.post('/studio/tools/call', requireAuth, (req, res) => {
    try { res.json(studio.callTool(req.body)); } catch (error) { platformError(res, error); }
});
router.post('/studio/structured/validate', requireAuth, (req, res) => {
    res.json(studio.validateStructured(req.body?.output, req.body?.schema));
});
router.post('/studio/evidence/check', requireAuth, (req, res) => {
    res.json({ claims: studio.checkEvidence(req.body?.claims, req.body?.passages) });
});

module.exports = router;
